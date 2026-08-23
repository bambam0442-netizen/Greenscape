export const config = { maxDuration: 300 }

function getApiKey(req) {
  const headerKey = String(req.headers['x-openai-key'] || '').trim()
  return (
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    process.env.OPENAI_API_TOKEN ||
    headerKey ||
    ''
  ).trim()
}

function parseApiPayload(raw) {
  try { return raw ? JSON.parse(raw) : null } catch { return null }
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
    const size = w && h
      ? (w / h > 1.18 ? '1536x1024' : (h / w > 1.18 ? '1024x1536' : '1024x1024'))
      : 'auto'

    const cleanMode = String(mode || '').startsWith('clean-')

    function buildForm(model) {
      const form = new FormData()
      form.append('model', model)
      form.append('prompt', prompt)
      form.append('size', size)
      form.append('quality', 'high')
      form.append('input_fidelity', 'high')
      form.append('output_format', 'jpeg')
      form.append('output_compression', cleanMode ? '92' : '82')
      form.append('image', new Blob([bytes], { type:`image/${format}` }), `greenscape-layout.${format}`)
      form.append('mask', new Blob([maskBytes], { type:'image/png' }), 'greenscape-plant-mask.png')
      return form
    }

    async function callImageEdit(model) {
      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method:'POST',
        headers:{ Authorization:`Bearer ${apiKey}` },
        body:buildForm(model)
      })
      const raw = await response.text()
      return { response, raw, payload:parseApiPayload(raw), model }
    }

    // Keep the proven v0.3.8 plant render pipeline on its existing model.
    // Clean Slate uses GPT Image 2 because it is the current state-of-the-art
    // OpenAI image editing model and is better suited to subtractive reconstruction.
    let result = await callImageEdit(cleanMode ? 'gpt-image-2' : 'gpt-image-1')

    // If an older API account cannot access GPT Image 2 yet, fall back only for
    // Clean Slate rather than breaking the user's workflow outright.
    if (cleanMode && !result.response.ok) {
      const firstError = result.payload?.error?.message || result.raw || ''
      const modelAccessProblem = [400,403,404].includes(result.response.status) && /model|access|not found|does not exist|unsupported/i.test(firstError)
      if (modelAccessProblem) {
        result = await callImageEdit('gpt-image-1.5')
      }
    }

    if (!result.response.ok) {
      return res.status(result.response.status).json({
        ok:false,
        stage:'openai',
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
