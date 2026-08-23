(() => {
  const nativeFetch = window.fetch.bind(window)
  const CLEAN_MARKER = 'This is a conservative cleanup edit, not a redesign.'
  const CLEAN_VERSION = '0.3.9.2'
  const GENERATION_HALO_PX = 18

  const INPAINTING_CONTRACT = [
    'CLEAN SLATE INPAINTING CONTRACT:',
    'The transparent hole or holes in the input image are missing pixels where the selected object has already been removed. They are NOT dark objects, shadows, shrubs, mulch piles, blur patches, or placeholders.',
    'Fill every transparent hole completely with a believable continuation of the real scene behind the removed object.',
    'Never leave a dark silhouette, muddy blob, cloned-looking patch, soft blur, empty hole, or ghost of the removed object.',
    'Read the visible surface boundaries that enter the hole from every side and continue those surfaces through the hole with correct perspective, texture, scale, lighting, and color.',
    'If a hole crosses more than one surface, reconstruct each surface separately along the visible boundary: for example continue stone or brick wall above, gravel or mulch bed below, and lawn beyond the bed edge.',
    'Continue masonry courses, mortar lines, siding courses, foundation texture, bed edges, gravel, soil, and turf using the immediately adjacent real pixels as the primary reference.',
    'Do not invent a new landscape design and do not replace the removed plant with another plant or object.',
    'The finished patch must look like an ordinary photograph of the same property after the selected object was physically removed and the previously hidden background became visible.'
  ].join(' ')

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not decode Clean Slate image data.'))
      img.src = src
    })
  }

  function safetyFailure(message) {
    return new Response(JSON.stringify({
      error: message,
      stage: 'hard-clean-mask'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  function buildIntegralSelection(selected, width, height) {
    const stride = width + 1
    const integral = new Uint32Array((width + 1) * (height + 1))

    for (let y = 0; y < height; y++) {
      let rowSum = 0
      const rowOffset = y * width
      const integralRow = (y + 1) * stride
      const integralPrev = y * stride
      for (let x = 0; x < width; x++) {
        rowSum += selected[rowOffset + x]
        integral[integralRow + x + 1] = integral[integralPrev + x + 1] + rowSum
      }
    }
    return integral
  }

  function regionHasSelection(integral, width, height, x, y, radius) {
    const stride = width + 1
    const x0 = Math.max(0, x - radius)
    const y0 = Math.max(0, y - radius)
    const x1 = Math.min(width - 1, x + radius)
    const y1 = Math.min(height - 1, y + radius)

    const ax = x0
    const ay = y0
    const bx = x1 + 1
    const by = y1 + 1
    const sum = integral[by * stride + bx]
      - integral[ay * stride + bx]
      - integral[by * stride + ax]
      + integral[ay * stride + ax]
    return sum > 0
  }

  async function prepareCleanRequest(maskDataUrl, baseDataUrl, width, height) {
    const [maskImage, baseImage] = await Promise.all([
      loadImage(maskDataUrl),
      loadImage(baseDataUrl)
    ])

    const source = document.createElement('canvas')
    source.width = width
    source.height = height
    const sourceCtx = source.getContext('2d', { willReadFrequently: true })
    if (!sourceCtx) throw new Error('Clean Slate mask canvas is unavailable.')
    sourceCtx.drawImage(maskImage, 0, 0, width, height)
    const sourcePixels = sourceCtx.getImageData(0, 0, width, height)

    const selected = new Uint8Array(width * height)
    let selectedCount = 0
    for (let p = 0, i = 3; p < selected.length; p++, i += 4) {
      // v0.3.9 starts with an opaque white mask and erases where the user paints.
      // Any alpha reduction belongs to the user's selected cleanup region.
      if (sourcePixels.data[i] < 254) {
        selected[p] = 1
        selectedCount++
      }
    }
    if (!selectedCount) throw new Error('Clean Slate could not find a painted selection.')

    // Exact user-selected region. This remains the final compositing boundary, so
    // AI pixels can never replace any pixel the user did not paint.
    const allowedCanvas = document.createElement('canvas')
    allowedCanvas.width = width
    allowedCanvas.height = height
    const allowedCtx = allowedCanvas.getContext('2d')
    if (!allowedCtx) throw new Error('Clean Slate allowed mask canvas is unavailable.')
    const allowedPixels = allowedCtx.createImageData(width, height)

    for (let p = 0, i = 0; p < selected.length; p++, i += 4) {
      allowedPixels.data[i] = 255
      allowedPixels.data[i + 1] = 255
      allowedPixels.data[i + 2] = 255
      allowedPixels.data[i + 3] = selected[p] ? 255 : 0
    }
    allowedCtx.putImageData(allowedPixels, 0, 0)

    // Give the image model a small generation halo around the user's selection.
    // This lets it understand and continue stone courses, bed lines, lawn edges,
    // and other structures across the hole. The halo is generation-only; the final
    // hard composite still clips strictly to the user's original painted region.
    const integral = buildIntegralSelection(selected, width, height)
    const haloRadius = Math.max(8, Math.round(GENERATION_HALO_PX * width / 1050))

    const protectedCanvas = document.createElement('canvas')
    protectedCanvas.width = width
    protectedCanvas.height = height
    const protectedCtx = protectedCanvas.getContext('2d')
    if (!protectedCtx) throw new Error('Clean Slate protected mask canvas is unavailable.')
    const protectedPixels = protectedCtx.createImageData(width, height)

    for (let y = 0, p = 0, i = 0; y < height; y++) {
      for (let x = 0; x < width; x++, p++, i += 4) {
        const editableForGeneration = regionHasSelection(integral, width, height, x, y, haloRadius)
        protectedPixels.data[i] = 255
        protectedPixels.data[i + 1] = 255
        protectedPixels.data[i + 2] = 255
        protectedPixels.data[i + 3] = editableForGeneration ? 0 : 255
      }
    }
    protectedCtx.putImageData(protectedPixels, 0, 0)

    // Crucial v0.3.9.2 change: remove the selected object's pixels from the image
    // sent to the model. Previously the model could still see the shrub/object inside
    // the edit mask and sometimes reproduced it as a dark silhouette. A true transparent
    // hole makes the task unambiguously background reconstruction/inpainting.
    const inpaintCanvas = document.createElement('canvas')
    inpaintCanvas.width = width
    inpaintCanvas.height = height
    const inpaintCtx = inpaintCanvas.getContext('2d')
    if (!inpaintCtx) throw new Error('Clean Slate inpaint canvas is unavailable.')
    inpaintCtx.drawImage(baseImage, 0, 0, width, height)
    inpaintCtx.globalCompositeOperation = 'destination-out'
    inpaintCtx.drawImage(allowedCanvas, 0, 0, width, height)
    inpaintCtx.globalCompositeOperation = 'source-over'

    return {
      protectedMask: protectedCanvas.toDataURL('image/png'),
      allowedCanvas,
      inpaintImage: inpaintCanvas.toDataURL('image/png')
    }
  }

  async function hardComposite(baseDataUrl, aiBase64, allowedCanvas, width, height) {
    const [baseImage, aiImage] = await Promise.all([
      loadImage(baseDataUrl),
      loadImage(`data:image/jpeg;base64,${aiBase64}`)
    ])

    const aiLayer = document.createElement('canvas')
    aiLayer.width = width
    aiLayer.height = height
    const aiCtx = aiLayer.getContext('2d')
    if (!aiCtx) throw new Error('Clean Slate AI layer is unavailable.')
    aiCtx.drawImage(aiImage, 0, 0, width, height)
    aiCtx.globalCompositeOperation = 'destination-in'
    aiCtx.drawImage(allowedCanvas, 0, 0, width, height)
    aiCtx.globalCompositeOperation = 'source-over'

    const result = document.createElement('canvas')
    result.width = width
    result.height = height
    const resultCtx = result.getContext('2d')
    if (!resultCtx) throw new Error('Clean Slate result canvas is unavailable.')

    // Original property pixels are always the base. AI pixels are accepted only
    // inside the exact user-painted selection. The generation halo never leaks.
    resultCtx.drawImage(baseImage, 0, 0, width, height)
    resultCtx.drawImage(aiLayer, 0, 0, width, height)

    return result.toDataURL('image/jpeg', 1).split(',')[1]
  }

  window.fetch = async function hardCleanFetch(input, init) {
    let requestBody = null
    let cleanRequest = false

    if (init && typeof init.body === 'string') {
      try {
        requestBody = JSON.parse(init.body)
        cleanRequest = typeof requestBody?.prompt === 'string' && requestBody.prompt.includes(CLEAN_MARKER)
      } catch {
        cleanRequest = false
      }
    }

    if (!cleanRequest || !requestBody?.mask || !requestBody?.image || !requestBody?.width || !requestBody?.height) {
      return nativeFetch(input, init)
    }

    const originalBaseImage = requestBody.image
    let prepared = null

    try {
      prepared = await prepareCleanRequest(
        requestBody.mask,
        originalBaseImage,
        requestBody.width,
        requestBody.height
      )
      requestBody.mask = prepared.protectedMask
      requestBody.image = prepared.inpaintImage
      requestBody.mode = 'clean-v0392'
      requestBody.prompt = `${requestBody.prompt} ${INPAINTING_CONTRACT}`
    } catch (error) {
      console.error(`[GreenScape v${CLEAN_VERSION}] Could not prepare Clean Slate inpainting.`, error)
      return safetyFailure('Clean Slate inpainting mask could not be prepared. No cleanup was applied.')
    }

    const response = await nativeFetch(input, { ...init, body: JSON.stringify(requestBody) })
    if (!response.ok) return response

    try {
      const data = await response.clone().json()
      if (!data?.image) return response

      const compositeBase64 = await hardComposite(
        originalBaseImage,
        data.image,
        prepared.allowedCanvas,
        requestBody.width,
        requestBody.height
      )

      return new Response(JSON.stringify({
        ...data,
        image: compositeBase64,
        hardCleanMaskApplied: true,
        cleanVersion: CLEAN_VERSION
      }), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error(`[GreenScape v${CLEAN_VERSION}] Hard Clean composite failed.`, error)
      return safetyFailure('Clean Slate safety composite failed. No cleanup was applied.')
    }
  }

  window.__greenscapeHardCleanMaskV0392 = true
})()
