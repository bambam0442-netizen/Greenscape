import sharp from 'sharp'

export const config = { maxDuration: 300 }

const MANIFEST_MARKER = 'STRICT PER-INSTANCE PLACEMENT MANIFEST:'
const MANIFEST_END = ' INSTANCE LOCK:'
const INSTANCE_LOCK_VERSION = '0.3.9.3'
const INSTANCE_CONCURRENCY = 2

function getApiKey(req) {
  const headerKey = String(req.headers['x-openai-key'] || '').trim()
  return (
    headerKey ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    process.env.OPENAI_API_TOKEN ||
    ''
  ).trim()
}

function parseApiPayload(raw) {
  try { return raw ? JSON.parse(raw) : null } catch { return null }
}

function parseNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parsePlacementManifest(prompt) {
  const markerAt = prompt.indexOf(MANIFEST_MARKER)
  if (markerAt < 0) return []

  const afterMarker = prompt.slice(markerAt + MANIFEST_MARKER.length)
  const endAt = afterMarker.indexOf(MANIFEST_END)
  const manifest = (endAt >= 0 ? afterMarker.slice(0, endAt) : afterMarker).trim()
  if (!manifest) return []

  return manifest.split(' | ').map((raw, index) => {
    const block = raw.trim()
    const header = block.match(/^P(\d+)\s+\[id\s+([^\]]+)\]\s*=\s*(.*?);\s*left-to-right rank\s+(\d+)\s+of\s+(\d+)/i)
    const center = block.match(/center\s+(-?\d+(?:\.\d+)?)%\s*x\s*\/\s*(-?\d+(?:\.\d+)?)%\s*y/i)
    const box = block.match(/bounding box\s+L(-?\d+(?:\.\d+)?)\s+T(-?\d+(?:\.\d+)?)\s+R(-?\d+(?:\.\d+)?)\s+B(-?\d+(?:\.\d+)?)/i)
    const size = block.match(/box size\s+(-?\d+(?:\.\d+)?)%\s+wide\s*[×x]\s*(-?\d+(?:\.\d+)?)%\s+tall/i)
    const orientation = block.match(/orientation\s+(mirrored|original)/i)

    if (!header || !center || !box) {
      throw new Error(`Could not read plant instance P${index + 1} from the placement manifest.`)
    }

    const left = parseNumber(box[1])
    const top = parseNumber(box[2])
    const right = parseNumber(box[3])
    const bottom = parseNumber(box[4])

    return {
      order: parseNumber(header[1]),
      id: header[2].trim(),
      identity: header[3].trim(),
      rank: parseNumber(header[4]),
      total: parseNumber(header[5]),
      centerX: parseNumber(center[1]),
      centerY: parseNumber(center[2]),
      left,
      top,
      right,
      bottom,
      width: size ? parseNumber(size[1]) : Math.max(0.01, right - left),
      height: size ? parseNumber(size[2]) : Math.max(0.01, bottom - top),
      orientation: orientation ? orientation[1].toLowerCase() : 'original'
    }
  }).sort((a, b) => a.order - b.order)
}

function chooseOwner(instances, xPercent, yPercent) {
  let bestIndex = -1
  let bestScore = Infinity

  for (let i = 0; i < instances.length; i++) {
    const p = instances[i]
    const padX = Math.max(0.15, p.width * 0.02)
    const padY = Math.max(0.15, p.height * 0.02)
    const inside = xPercent >= p.left - padX && xPercent <= p.right + padX &&
      yPercent >= p.top - padY && yPercent <= p.bottom + padY
    if (!inside) continue

    const halfW = Math.max(0.5, p.width / 2)
    const halfH = Math.max(0.5, p.height / 2)
    const dx = (xPercent - p.centerX) / halfW
    const dy = (yPercent - p.centerY) / halfH
    const score = dx * dx + dy * dy
    if (score < bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  if (bestIndex >= 0) return bestIndex

  for (let i = 0; i < instances.length; i++) {
    const p = instances[i]
    const dx = xPercent - p.centerX
    const dy = yPercent - p.centerY
    const score = dx * dx + dy * dy
    if (score < bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return Math.max(0, bestIndex)
}

async function buildOwnership(maskBytes, requestedWidth, requestedHeight, instances) {
  const metadata = await sharp(maskBytes).metadata()
  const width = requestedWidth || metadata.width || 0
  const height = requestedHeight || metadata.height || 0
  if (!width || !height) throw new Error('Could not determine render mask dimensions.')

  const { data, info } = await sharp(maskBytes)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const ownership = new Int16Array(width * height)
  ownership.fill(-1)
  const counts = new Uint32Array(instances.length)

  for (let y = 0, pixel = 0, offset = 3; y < height; y++) {
    const yPercent = ((y + 0.5) / height) * 100
    for (let x = 0; x < width; x++, pixel++, offset += info.channels) {
      if (data[offset] >= 254) continue
      const xPercent = ((x + 0.5) / width) * 100
      const owner = chooseOwner(instances, xPercent, yPercent)
      ownership[pixel] = owner
      counts[owner]++
    }
  }

  return { width, height, ownership, counts }
}

async function buildInstanceMask(ownershipInfo, instanceIndex) {
  const { width, height, ownership, counts } = ownershipInfo
  if (!counts[instanceIndex]) throw new Error(`No editable pixels were found for plant instance P${instanceIndex + 1}.`)

  const rgba = Buffer.alloc(width * height * 4, 255)
  const alpha = Buffer.alloc(width * height, 0)

  for (let pixel = 0, offset = 3; pixel < ownership.length; pixel++, offset += 4) {
    const owned = ownership[pixel] === instanceIndex
    rgba[offset] = owned ? 0 : 255
    alpha[pixel] = owned ? 255 : 0
  }

  const maskBytes = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer()
  return { maskBytes, alpha }
}

function buildInstancePrompt(instance, total) {
  return [
    'Perform one localized photorealistic plant substitution on this exact property photograph.',
    `SINGLE INSTANCE MODE: this request is only for P${instance.order} of ${total}: ${instance.identity}.`,
    'The transparent editable mask belongs to this one physical specimen only. Produce exactly one plant inside this mask and zero additional plants.',
    `IDENTITY LOCK: the result must remain ${instance.identity}. Preserve the supplied cutout's dominant foliage color, flower color, growth habit, maturity, density, and overall silhouette. Do not substitute another species or cultivar.`,
    `GEOMETRY LOCK: preserve center ${instance.centerX.toFixed(2)}% x / ${instance.centerY.toFixed(2)}% y and measured bounding box L${instance.left.toFixed(2)} T${instance.top.toFixed(2)} R${instance.right.toFixed(2)} B${instance.bottom.toFixed(2)}.`,
    `ORDER LOCK: this is left-to-right rank ${instance.rank} of ${total}. Do not cross, merge with, or occupy the footprint of any neighboring specimen.`,
    `ORIENTATION LOCK: ${instance.orientation}. Keep the plant inside the editable footprint; do not enlarge, spread, merge, split, duplicate, or move it.`,
    'Treat the visible cutout as a tracing/template. Replace its graphic appearance with believable botanical detail, natural stems and foliage, matching site light, depth, sharpness, and contact shadow while retaining its individual footprint.',
    'All pixels outside the transparent mask are protected reference content. Do not alter the house, bed, lawn, hardscape, existing vegetation, other proposed plant cutouts, camera, perspective, framing, lighting, or color balance.',
    'Do not invent mulch, rock, edging, flowers, groundcover, filler shrubs, furniture, ornaments, or any other design element.',
    'If realism conflicts with the exact identity, count, center, footprint, or separation of this one specimen, choose exact instance fidelity.'
  ].join(' ')
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0

  async function runner() {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()))
  return results
}

function sizeFor(width, height) {
  return width && height
    ? (width / height > 1.18 ? '1536x1024' : (height / width > 1.18 ? '1024x1536' : '1024x1024'))
    : 'auto'
}

async function callImageEdit({ apiKey, model, prompt, imageBytes, imageFormat, maskBytes, size, compression }) {
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', size)
  form.append('quality', 'high')
  form.append('input_fidelity', 'high')
  form.append('output_format', 'jpeg')
  form.append('output_compression', String(compression))
  form.append('image', new Blob([imageBytes], { type:`image/${imageFormat}` }), `greenscape-layout.${imageFormat}`)
  form.append('mask', new Blob([maskBytes], { type:'image/png' }), 'greenscape-plant-mask.png')

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method:'POST',
    headers:{ Authorization:`Bearer ${apiKey}` },
    body:form
  })
  const raw = await response.text()
  return { response, raw, payload:parseApiPayload(raw), model }
}

async function renderHardLockedInstances({ apiKey, prompt, imageBytes, imageFormat, maskBytes, width, height, size }) {
  const instances = parsePlacementManifest(prompt)
  if (!instances.length) throw new Error('No plant instances were found in the placement manifest.')
  if (instances.length > 16) throw new Error('Instance-locked render currently supports up to 16 proposed plants per render.')

  const ownershipInfo = await buildOwnership(maskBytes, width, height, instances)

  const outputs = await runPool(instances, INSTANCE_CONCURRENCY, async (instance, index) => {
    const { maskBytes: instanceMask, alpha } = await buildInstanceMask(ownershipInfo, index)
    const result = await callImageEdit({
      apiKey,
      model:'gpt-image-1',
      prompt:buildInstancePrompt(instance, instances.length),
      imageBytes,
      imageFormat,
      maskBytes:instanceMask,
      size,
      compression:90
    })

    if (!result.response.ok) {
      const message = result.payload?.error?.message || result.raw.slice(0,220) || `OpenAI returned ${result.response.status}.`
      const error = new Error(`P${instance.order} ${instance.identity}: ${message}`)
      error.status = result.response.status
      throw error
    }

    const imageBase64 = result.payload?.data?.[0]?.b64_json
    if (!imageBase64) throw new Error(`P${instance.order} ${instance.identity}: no image returned by renderer.`)
    return { imageBase64, alpha, instance }
  })

  const layers = []
  for (const output of outputs) {
    const aiBytes = Buffer.from(output.imageBase64, 'base64')
    const { data: rgb } = await sharp(aiBytes)
      .resize(ownershipInfo.width, ownershipInfo.height, { fit:'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject:true })

    const rgba = Buffer.alloc(ownershipInfo.width * ownershipInfo.height * 4)
    for (let pixel = 0, rgbOffset = 0, rgbaOffset = 0; pixel < output.alpha.length; pixel++, rgbOffset += 3, rgbaOffset += 4) {
      rgba[rgbaOffset] = rgb[rgbOffset]
      rgba[rgbaOffset + 1] = rgb[rgbOffset + 1]
      rgba[rgbaOffset + 2] = rgb[rgbOffset + 2]
      rgba[rgbaOffset + 3] = output.alpha[pixel]
    }

    layers.push({
      input:await sharp(rgba, { raw:{ width:ownershipInfo.width, height:ownershipInfo.height, channels:4 } }).png().toBuffer(),
      blend:'over'
    })
  }

  const finalBytes = await sharp(imageBytes)
    .resize(ownershipInfo.width, ownershipInfo.height, { fit:'fill' })
    .composite(layers)
    .jpeg({ quality:95, chromaSubsampling:'4:4:4' })
    .toBuffer()

  return {
    imageBase64:finalBytes.toString('base64'),
    instanceCount:instances.length
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, stage:'method', error:'Method not allowed' })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return res.status(500).json({
      ok:false,
      stage:'environment',
      error:'No OpenAI API key is available. Add it once in GreenScape Settings or in Vercel.',
      acceptedNames:['OPENAI_API_KEY','OPENAI_KEY','OPENAI_API_TOKEN'],
      vercelEnv:process.env.VERCEL_ENV || null,
      targetEnv:process.env.VERCEL_TARGET_ENV || null
    })
  }

  try {
    const { image, mask, prompt, width, height, mode } = req.body || {}
    if (!image || !mask || !prompt) {
      return res.status(400).json({ ok:false, stage:'input', error:'Image, plant mask, and prompt are required.' })
    }

    const match = String(image).match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
    if (!match) return res.status(400).json({ ok:false, stage:'input', error:'Invalid image data.' })

    const format = match[1] === 'jpg' ? 'jpeg' : match[1]
    const bytes = Buffer.from(match[2], 'base64')

    const maskMatch = String(mask).match(/^data:image\/png;base64,(.+)$/)
    if (!maskMatch) return res.status(400).json({ ok:false, stage:'input', error:'Invalid plant edit mask.' })
    const maskBytes = Buffer.from(maskMatch[1], 'base64')

    if (bytes.length > 3_000_000) {
      return res.status(413).json({
        ok:false, stage:'payload',
        error:`Render input is too large (${Math.round(bytes.length/1024)} KB).`
      })
    }

    const w = Number(width) || 0
    const h = Number(height) || 0
    const size = sizeFor(w, h)
    const cleanMode = String(mode || '').startsWith('clean-')
    const hardInstanceMode = !cleanMode && String(prompt).includes(MANIFEST_MARKER)

    if (hardInstanceMode) {
      try {
        const locked = await renderHardLockedInstances({
          apiKey,
          prompt:String(prompt),
          imageBytes:bytes,
          imageFormat:format,
          maskBytes,
          width:w,
          height:h,
          size
        })

        return res.status(200).json({
          ok:true,
          image:locked.imageBase64,
          modelUsed:'gpt-image-1',
          renderMode:'design-instance-lock',
          hardInstanceLockApplied:true,
          instanceLockVersion:INSTANCE_LOCK_VERSION,
          instanceCount:locked.instanceCount
        })
      } catch (error) {
        const status = Number(error?.status) || 500
        return res.status(status).json({
          ok:false,
          stage:'instance-lock',
          error:error instanceof Error ? error.message : 'Instance-locked rendering failed.',
          instanceLockVersion:INSTANCE_LOCK_VERSION
        })
      }
    }

    // Clean Slate remains one masked edit because its browser-side hard-mask layer
    // already clips the generated cleanup back to the exact painted selection.
    let result = await callImageEdit({
      apiKey,
      model:cleanMode ? 'gpt-image-2' : 'gpt-image-1',
      prompt:String(prompt),
      imageBytes:bytes,
      imageFormat:format,
      maskBytes,
      size,
      compression:cleanMode ? 92 : 82
    })

    // If an older API account cannot access GPT Image 2 yet, fall back only for
    // Clean Slate rather than breaking the user's workflow outright.
    if (cleanMode && !result.response.ok) {
      const firstError = result.payload?.error?.message || result.raw || ''
      const modelAccessProblem = [400,403,404].includes(result.response.status) && /model|access|not found|does not exist|unsupported/i.test(firstError)
      if (modelAccessProblem) {
        result = await callImageEdit({
          apiKey,
          model:'gpt-image-1.5',
          prompt:String(prompt),
          imageBytes:bytes,
          imageFormat:format,
          maskBytes,
          size,
          compression:92
        })
      }
    }

    if (!result.response.ok) {
      return res.status(result.response.status).json({
        ok:false, stage:'openai',
        error:result.payload?.error?.message || result.raw.slice(0,220) || `OpenAI returned ${result.response.status}.`
      })
    }

    const imageBase64 = result.payload?.data?.[0]?.b64_json
    if (!imageBase64) return res.status(502).json({ok:false,stage:'openai',error:'No image returned by renderer.'})

    return res.status(200).json({
      ok:true,
      image:imageBase64,
      modelUsed:result.model,
      renderMode:cleanMode ? 'clean' : 'design'
    })
  } catch (error) {
    return res.status(500).json({
      ok:false, stage:'exception',
      error:error instanceof Error ? error.message : 'Unexpected render error.'
    })
  }
}
