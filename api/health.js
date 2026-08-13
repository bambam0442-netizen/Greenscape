
export default function handler(req, res) {
  const candidates = [
    ['OPENAI_API_KEY', process.env.OPENAI_API_KEY],
    ['OPENAI_KEY', process.env.OPENAI_KEY],
    ['OPENAI_API_TOKEN', process.env.OPENAI_API_TOKEN],
  ]
  const found = candidates.find(([,v]) => typeof v === 'string' && v.trim().length > 0)
  return res.status(found ? 200 : 500).json({
    ok:Boolean(found),
    openaiKeyPresent:Boolean(found),
    keyName:found ? found[0] : null,
    vercelEnv:process.env.VERCEL_ENV || null,
    targetEnv:process.env.VERCEL_TARGET_ENV || null
  })
}
