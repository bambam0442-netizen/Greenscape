
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
    const { image, mask, prompt, width, height } = req.body || {}
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

    const form = new FormData()
    form.append('model','gpt-image-1')
    form.append('prompt',prompt)
    const w = Number(width) || 0
    const h = Number(height) || 0
    const size = w && h
      ? (w / h > 1.18 ? '1536x1024' : (h / w > 1.18 ? '1024x1536' : '1024x1024'))
      : 'auto'

    form.append('size', size)
    form.append('quality','high')
    form.append('input_fidelity','high')
    form.append('output_format','jpeg')
    form.append('output_compression','82')
    form.append('image',new Blob([bytes],{type:`image/${format}`}),`greenscape-layout.${format}`)
    form.append('mask',new Blob([maskBytes],{type:'image/png'}),'greenscape-plant-mask.png')

    const response = await fetch('https://api.openai.com/v1/images/edits',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`},
      body:form
    })

    const raw = await response.text()
    let payload = null
    try { payload = raw ? JSON.parse(raw) : null } catch {}

    if (!response.ok) {
      return res.status(response.status).json({
        ok:false, stage:'openai',
        error:payload?.error?.message || raw.slice(0,220) || `OpenAI returned ${response.status}.`
      })
    }

    const imageBase64 = payload?.data?.[0]?.b64_json
    if (!imageBase64) return res.status(502).json({ok:false,stage:'openai',error:'No image returned by renderer.'})

    return res.status(200).json({ok:true,image:imageBase64})
  } catch (error) {
    return res.status(500).json({
      ok:false, stage:'exception',
      error:error instanceof Error ? error.message : 'Unexpected render error.'
    })
  }
}
