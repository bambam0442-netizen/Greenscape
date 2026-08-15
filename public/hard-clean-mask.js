(() => {
  const nativeFetch = window.fetch.bind(window)
  const CLEAN_MARKER = 'This is a conservative cleanup edit, not a redesign.'

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not decode Clean Slate image data.'))
      img.src = src
    })
  }

  async function buildHardMasks(maskDataUrl, width, height) {
    const maskImage = await loadImage(maskDataUrl)

    const source = document.createElement('canvas')
    source.width = width
    source.height = height
    const sourceCtx = source.getContext('2d', { willReadFrequently: true })
    if (!sourceCtx) throw new Error('Clean Slate mask canvas is unavailable.')
    sourceCtx.drawImage(maskImage, 0, 0, width, height)

    const sourcePixels = sourceCtx.getImageData(0, 0, width, height)

    const protectedCanvas = document.createElement('canvas')
    protectedCanvas.width = width
    protectedCanvas.height = height
    const protectedCtx = protectedCanvas.getContext('2d')
    if (!protectedCtx) throw new Error('Clean Slate protected mask canvas is unavailable.')
    const protectedPixels = protectedCtx.createImageData(width, height)

    const allowedCanvas = document.createElement('canvas')
    allowedCanvas.width = width
    allowedCanvas.height = height
    const allowedCtx = allowedCanvas.getContext('2d')
    if (!allowedCtx) throw new Error('Clean Slate allowed mask canvas is unavailable.')
    const allowedPixels = allowedCtx.createImageData(width, height)

    for (let i = 0; i < sourcePixels.data.length; i += 4) {
      // v0.3.9 builds a white protected mask, then partially erases the painted red
      // selection. Outside the user's brush the alpha is exactly 255. Any alpha
      // reduction therefore belongs to the user's selection. Convert that into a
      // truly binary mask so the model gets an unambiguous edit region.
      const selected = sourcePixels.data[i + 3] < 254

      protectedPixels.data[i] = 255
      protectedPixels.data[i + 1] = 255
      protectedPixels.data[i + 2] = 255
      protectedPixels.data[i + 3] = selected ? 0 : 255

      allowedPixels.data[i] = 255
      allowedPixels.data[i + 1] = 255
      allowedPixels.data[i + 2] = 255
      allowedPixels.data[i + 3] = selected ? 255 : 0
    }

    protectedCtx.putImageData(protectedPixels, 0, 0)
    allowedCtx.putImageData(allowedPixels, 0, 0)

    return {
      protectedMask: protectedCanvas.toDataURL('image/png'),
      allowedCanvas
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

    // The working GreenScape frame is always the base. AI pixels are laid on top
    // only where the user actually painted. This prevents model edits to windows,
    // siding, porch details, lawn, hardscape, or any other unselected pixels.
    resultCtx.drawImage(baseImage, 0, 0, width, height)
    resultCtx.drawImage(aiLayer, 0, 0, width, height)

    // main.tsx currently expects the render endpoint's base64 payload to be JPEG.
    // Quality 1 minimizes recompression while the binary composite guarantees no
    // semantic content from the AI can leak outside the selected region.
    return result.toDataURL('image/jpeg', 1).split(',')[1]
  }

  window.fetch = async function hardCleanFetch(input, init) {
    let requestBody = null
    let hardMasks = null
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

    try {
      hardMasks = await buildHardMasks(requestBody.mask, requestBody.width, requestBody.height)
      requestBody.mask = hardMasks.protectedMask
    } catch (error) {
      console.error('[GreenScape v0.3.9.1] Could not harden Clean Slate mask.', error)
      return nativeFetch(input, init)
    }

    const response = await nativeFetch(input, { ...init, body: JSON.stringify(requestBody) })
    if (!response.ok) return response

    try {
      const data = await response.clone().json()
      if (!data?.image) return response

      const compositeBase64 = await hardComposite(
        requestBody.image,
        data.image,
        hardMasks.allowedCanvas,
        requestBody.width,
        requestBody.height
      )

      return new Response(JSON.stringify({
        ...data,
        image: compositeBase64,
        hardCleanMaskApplied: true
      }), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('[GreenScape v0.3.9.1] Hard Clean composite failed; returning server result.', error)
      return response
    }
  }

  window.__greenscapeHardCleanMaskV0391 = true
})()
