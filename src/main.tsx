import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './v038.css'
import './v039.css'

const OPENAI_LOCAL_KEY = 'greenscape_openai_api_key'
const getLocalOpenAIKey = () => localStorage.getItem(OPENAI_LOCAL_KEY) || ''
const setLocalOpenAIKey = (value: string) => localStorage.setItem(OPENAI_LOCAL_KEY, value.trim())

type Screen = 'home' | 'project' | 'editor' | 'library' | 'gallery'
type Tool = 'clean' | 'bed' | 'plants' | 'preview'
type CleanMode = 'paint' | 'erase'

type Asset = {
  key: string
  name: string
  src: string
  category: string
  cultivar?: string
  defaultScale?: number
}

type Plant = {
  id: number
  assetKey: string
  name: string
  src: string
  x: number
  y: number
  scale: number
  opacity: number
  flipX: boolean
  shadow: number
}

type RenderPlacement = {
  id: number
  order: number
  leftToRightRank: number
  assetKey: string
  name: string
  centerXPercent: number
  centerYPercent: number
  widthPercent: number
  heightPercent: number
  leftPercent: number
  topPercent: number
  rightPercent: number
  bottomPercent: number
  scale: number
  flipX: boolean
}

type EditorFrame = {
  left: number
  top: number
  width: number
  height: number
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
}

const assets: Asset[] = [
  { key: 'boxwood', name: 'Boxwood', category: 'Shrub', cultivar: 'Standard', defaultScale: .82, src: '/plants/boxwood.png' },
  { key: 'hydrangea', name: 'Hydrangea', category: 'Flowering Shrub', cultivar: 'Blue Mophead', defaultScale: .95, src: '/plants/hydrangea.png' },
  { key: 'loropetalum', name: 'Loropetalum', category: 'Shrub', cultivar: 'Purple', defaultScale: .95, src: '/plants/loropetalum.png' },
  { key: 'maiden-grass', name: 'Maiden Grass', category: 'Grass', cultivar: 'Standard', defaultScale: .90, src: '/plants/maiden-grass.png' },
  { key: 'arborvitae', name: 'Arborvitae', category: 'Evergreen', cultivar: 'Green Giant', defaultScale: 1.15, src: '/plants/arborvitae.png' },
  { key: 'crepe-myrtle', name: 'Crepe Myrtle', category: 'Tree', cultivar: 'Pink', defaultScale: 1.30, src: '/plants/crepe-myrtle.png' }
]

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [customer, setCustomer] = useState('')
  const [address, setAddress] = useState('')
  const [originalPhoto, setOriginalPhoto] = useState<string | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [plants, setPlants] = useState<Plant[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeTool, setActiveTool] = useState<Tool>('plants')
  const [presenting, setPresenting] = useState(false)
  const [renderNotice, setRenderNotice] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [renderedImage, setRenderedImage] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [cleanMode, setCleanMode] = useState<CleanMode>('paint')
  const [brushSize, setBrushSize] = useState(46)
  const [cleanHasSelection, setCleanHasSelection] = useState(false)
  const [cleanUndoDepth, setCleanUndoDepth] = useState(0)
  const [cleanHistory, setCleanHistory] = useState<string[]>([])

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const plantImportRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const cleanMaskRef = useRef<HTMLCanvasElement>(null)
  const cleanUndoRef = useRef<string[]>([])
  const cleanDrawingRef = useRef({ drawing: false, pointerId: -1, x: 0, y: 0 })

  const selected = useMemo(() => plants.find(p => p.id === selectedId) || null, [plants, selectedId])
  const isCleaned = Boolean(photo && originalPhoto && photo !== originalPhoto)

  useEffect(() => {
    if (screen !== 'editor' || activeTool !== 'clean') return
    const sync = () => requestAnimationFrame(() => resizeCleanMaskCanvas(true))
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [screen, activeTool, photo])

  function onPhoto(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = String(reader.result)
      setOriginalPhoto(data)
      setPhoto(data)
      setCleanHistory([])
      resetCleanMask()
      setScreen('editor')
    }
    reader.readAsDataURL(file)
  }

  function addAsset(asset: Asset) {
    const offset = (plants.length % 5) * 5
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setPlants(prev => [...prev, {
      id, assetKey: asset.key, name: asset.name, src: asset.src,
      x: 50 + offset, y: 58 + (plants.length % 2) * 4, scale: asset.defaultScale ?? 1, opacity: 1, flipX: false, shadow: .22
    }])
    setSelectedId(id)
    setActiveTool('plants')
  }

  function importPlant(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const name = file.name.replace(/\.[^/.]+$/, '') || 'Imported Plant'
      const id = Date.now()
      setPlants(prev => [...prev, {
        id, assetKey: `custom-${id}`, name, src: String(reader.result),
        x: 50, y: 58, scale: 1, opacity: 1, flipX: false, shadow: .22
      }])
      setSelectedId(id)
    }
    reader.readAsDataURL(file)
  }

  function updatePlant(id: number, patch: Partial<Plant>) {
    setPlants(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function duplicateSelected() {
    if (!selected) return
    const id = Date.now()
    setPlants(prev => [...prev, { ...selected, id, x: Math.min(92, selected.x + 6), y: Math.min(92, selected.y + 4) }])
    setSelectedId(id)
  }

  function deleteSelected() {
    if (!selected) return
    setPlants(prev => prev.filter(p => p.id !== selected.id))
    setSelectedId(null)
  }

  function getCanvasContentRect() {
    const canvas = canvasRef.current
    if (!canvas) return null
    const outer = canvas.getBoundingClientRect()
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width < 1 || height < 1) return null
    return {
      left: outer.left + canvas.clientLeft,
      top: outer.top + canvas.clientTop,
      width,
      height
    }
  }

  function measureEditorFrame(bg: HTMLImageElement): EditorFrame {
    const rect = getCanvasContentRect()
    if (!rect) throw new Error('The design canvas is unavailable.')
    if (!bg.naturalWidth || !bg.naturalHeight) throw new Error('The jobsite photo has invalid dimensions.')

    const coverScale = Math.max(rect.width / bg.naturalWidth, rect.height / bg.naturalHeight)
    const sourceWidth = rect.width / coverScale
    const sourceHeight = rect.height / coverScale

    return {
      ...rect,
      sourceX: (bg.naturalWidth - sourceWidth) / 2,
      sourceY: (bg.naturalHeight - sourceHeight) / 2,
      sourceWidth,
      sourceHeight
    }
  }

  function measurePlacement(p: Plant, index: number, frame: EditorFrame): RenderPlacement | null {
    const plantImage = canvasRef.current?.querySelector<HTMLImageElement>(`img[data-plant-id="${p.id}"]`)
    if (!plantImage) return null
    const rect = plantImage.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null

    const centerXPercent = ((rect.left + rect.width / 2 - frame.left) / frame.width) * 100
    const centerYPercent = ((rect.top + rect.height / 2 - frame.top) / frame.height) * 100
    const widthPercent = (rect.width / frame.width) * 100
    const heightPercent = (rect.height / frame.height) * 100

    return {
      id: p.id,
      order: index + 1,
      leftToRightRank: 0,
      assetKey: p.assetKey,
      name: p.name,
      centerXPercent,
      centerYPercent,
      widthPercent,
      heightPercent,
      leftPercent: centerXPercent - widthPercent / 2,
      topPercent: centerYPercent - heightPercent / 2,
      rightPercent: centerXPercent + widthPercent / 2,
      bottomPercent: centerYPercent + heightPercent / 2,
      scale: p.scale,
      flipX: p.flipX
    }
  }

  function measurePlacements(frame: EditorFrame) {
    const placements = plants.map((p, index) => measurePlacement(p, index, frame))
    if (placements.some(p => p === null)) {
      throw new Error('GreenScape could not measure one or more placed plants. Return to the layout and try again.')
    }

    const resolved = placements as RenderPlacement[]
    const spatialOrder = [...resolved].sort((a, b) =>
      a.centerXPercent - b.centerXPercent || a.order - b.order
    )
    spatialOrder.forEach((placement, rank) => {
      placement.leftToRightRank = rank + 1
    })
    return resolved
  }

  function canonicalCanvasSize(frame: EditorFrame, longEdge: number) {
    return frame.width >= frame.height
      ? { width: longEdge, height: Math.round(longEdge * 2 / 3) }
      : { width: Math.round(longEdge * 2 / 3), height: longEdge }
  }

  function drawEditorCrop(ctx: CanvasRenderingContext2D, bg: HTMLImageElement, frame: EditorFrame, width: number, height: number) {
    ctx.drawImage(
      bg,
      frame.sourceX, frame.sourceY, frame.sourceWidth, frame.sourceHeight,
      0, 0, width, height
    )
  }

  function beginDrag(e: React.PointerEvent, plant: Plant) {
    if (activeTool === 'clean') return
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(plant.id)
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => {
      const rect = getCanvasContentRect()
      if (!rect) return
      const x = ((ev.clientX - rect.left) / rect.width) * 100
      const y = ((ev.clientY - rect.top) / rect.height) * 100
      updatePlant(plant.id, { x: Math.max(3, Math.min(97, x)), y: Math.max(4, Math.min(96, y)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function resizeCleanMaskCanvas(preserve: boolean) {
    const canvas = cleanMaskRef.current
    const frame = getCanvasContentRect()
    if (!canvas || !frame) return
    const nextW = Math.max(1, Math.round(frame.width))
    const nextH = Math.max(1, Math.round(frame.height))
    if (canvas.width === nextW && canvas.height === nextH) return

    const previous = document.createElement('canvas')
    previous.width = canvas.width || 1
    previous.height = canvas.height || 1
    if (canvas.width && canvas.height) previous.getContext('2d')?.drawImage(canvas, 0, 0)

    canvas.width = nextW
    canvas.height = nextH
    if (preserve && previous.width > 1 && previous.height > 1) {
      canvas.getContext('2d')?.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, nextW, nextH)
    }
  }

  function maskPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = cleanMaskRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  function pushCleanUndo() {
    resizeCleanMaskCanvas(true)
    const canvas = cleanMaskRef.current
    if (!canvas) return
    cleanUndoRef.current.push(canvas.toDataURL('image/png'))
    if (cleanUndoRef.current.length > 20) cleanUndoRef.current.shift()
    setCleanUndoDepth(cleanUndoRef.current.length)
  }

  function drawCleanDot(x: number, y: number) {
    const canvas = cleanMaskRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.save()
    ctx.globalCompositeOperation = cleanMode === 'erase' ? 'destination-out' : 'source-over'
    ctx.fillStyle = 'rgba(255, 78, 78, .62)'
    ctx.beginPath()
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function drawCleanLine(fromX: number, fromY: number, toX: number, toY: number) {
    const canvas = cleanMaskRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.save()
    ctx.globalCompositeOperation = cleanMode === 'erase' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = 'rgba(255, 78, 78, .62)'
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(toX, toY)
    ctx.stroke()
    ctx.restore()
  }

  function refreshCleanSelectionState() {
    const canvas = cleanMaskRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !canvas.width || !canvas.height) {
      setCleanHasSelection(false)
      return
    }
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let found = false
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 8) { found = true; break }
    }
    setCleanHasSelection(found)
  }

  function startCleanStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (cleaning) return
    e.preventDefault()
    e.stopPropagation()
    resizeCleanMaskCanvas(true)
    const point = maskPoint(e)
    if (!point) return
    pushCleanUndo()
    e.currentTarget.setPointerCapture(e.pointerId)
    cleanDrawingRef.current = { drawing: true, pointerId: e.pointerId, x: point.x, y: point.y }
    drawCleanDot(point.x, point.y)
    if (cleanMode === 'paint') setCleanHasSelection(true)
  }

  function moveCleanStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    const drawing = cleanDrawingRef.current
    if (!drawing.drawing || drawing.pointerId !== e.pointerId) return
    e.preventDefault()
    e.stopPropagation()
    const point = maskPoint(e)
    if (!point) return
    drawCleanLine(drawing.x, drawing.y, point.x, point.y)
    drawing.x = point.x
    drawing.y = point.y
  }

  function endCleanStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    const drawing = cleanDrawingRef.current
    if (!drawing.drawing || drawing.pointerId !== e.pointerId) return
    e.preventDefault()
    e.stopPropagation()
    cleanDrawingRef.current = { drawing: false, pointerId: -1, x: 0, y: 0 }
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    refreshCleanSelectionState()
  }

  function resetCleanMask() {
    const canvas = cleanMaskRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    cleanUndoRef.current = []
    setCleanUndoDepth(0)
    setCleanHasSelection(false)
  }

  function clearCleanSelection() {
    if (!cleanHasSelection) return
    pushCleanUndo()
    const canvas = cleanMaskRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setCleanHasSelection(false)
  }

  function undoCleanSelection() {
    const canvas = cleanMaskRef.current
    if (!canvas || !cleanUndoRef.current.length) return
    const snapshot = cleanUndoRef.current.pop()!
    setCleanUndoDepth(cleanUndoRef.current.length)
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      refreshCleanSelectionState()
    }
    img.src = snapshot
  }

  function ensureOpenAIKey() {
    let key = getLocalOpenAIKey()
    if (!key) {
      const entered = window.prompt('Paste your OpenAI API key once. It stays in this browser and is not saved in the GreenScape project.')
      if (!entered) throw new Error('OpenAI API key is required.')
      setLocalOpenAIKey(entered)
      key = getLocalOpenAIKey()
    }
    return key
  }

  async function parseRenderResponse(response: Response) {
    const raw = await response.text()
    let data: any = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${raw.slice(0, 180) || 'Request failed.'}`)
      throw new Error(`Renderer returned an unexpected response: ${raw.slice(0, 180)}`)
    }

    if (!response.ok) {
      const stage = data?.stage ? ` [${data.stage}]` : ''
      if (response.status === 401 || /api key|authentication|incorrect/i.test(data?.error || '')) {
        localStorage.removeItem(OPENAI_LOCAL_KEY)
      }
      throw new Error(`${data?.error || `${response.status} ${response.statusText}`}${stage}`)
    }
    if (!data?.image) throw new Error('The renderer did not return an image.')
    return data.image as string
  }

  function buildCleanPayload(): Promise<{ image: string; mask: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      if (!photo) return reject(new Error('No jobsite photo loaded.'))
      const selectionCanvas = cleanMaskRef.current
      if (!selectionCanvas || !cleanHasSelection) return reject(new Error('Paint over at least one area to remove first.'))

      const bg = new Image()
      bg.onload = () => {
        try {
          const frame = measureEditorFrame(bg)
          const { width: w, height: h } = canonicalCanvasSize(frame, 1050)
          const imageCanvas = document.createElement('canvas')
          imageCanvas.width = w
          imageCanvas.height = h
          const ctx = imageCanvas.getContext('2d')
          if (!ctx) return reject(new Error('Canvas is unavailable.'))
          drawEditorCrop(ctx, bg, frame, w, h)

          const maskCanvas = document.createElement('canvas')
          maskCanvas.width = w
          maskCanvas.height = h
          const maskCtx = maskCanvas.getContext('2d')
          if (!maskCtx) return reject(new Error('Mask canvas is unavailable.'))
          maskCtx.fillStyle = '#ffffff'
          maskCtx.fillRect(0, 0, w, h)
          maskCtx.save()
          maskCtx.globalCompositeOperation = 'destination-out'
          maskCtx.drawImage(selectionCanvas, 0, 0, selectionCanvas.width, selectionCanvas.height, 0, 0, w, h)
          maskCtx.restore()

          resolve({
            image: imageCanvas.toDataURL('image/png'),
            mask: maskCanvas.toDataURL('image/png'),
            width: w,
            height: h
          })
        } catch (err) {
          reject(err)
        }
      }
      bg.onerror = () => reject(new Error('Could not load the working property photo.'))
      bg.src = photo
    })
  }

  async function cleanSelectedAreas() {
    if (!photo || !cleanHasSelection || cleaning) return
    setCleaning(true)
    setRenderError(null)
    try {
      const payload = await buildCleanPayload()
      const prompt = [
        'Remove only the existing objects or landscaping inside the transparent selected mask and reconstruct the scene as if those selected objects were never there.',
        'This is a conservative cleanup edit, not a redesign.',
        'Use the immediate surrounding pixels to continue the most plausible existing background through the selected area: matching siding, brick, foundation, mulch, gravel, soil, lawn, sidewalk, driveway, or other already-present surface as appropriate.',
        'Do not add replacement shrubs, flowers, trees, people, furniture, ornaments, structures, edging, beds, or new design elements.',
        'Preserve all pixels outside the editable mask as closely as possible.',
        'Do not alter rooflines, windows, doors, trim, siding, brick patterns, sidewalks, driveway geometry, utilities, neighboring scenery, camera position, lens perspective, framing, lighting, or color balance except where tiny local blending is required at the mask edge.',
        'If the selected area contains part of an existing shrub or object, remove that selected object cleanly rather than recreating it.',
        'The result should look like the same untouched customer photo after the selected landscape clutter or plant material was physically removed.'
      ].join(' ')

      const response = await fetch('/api/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenAI-Key': ensureOpenAIKey()
        },
        body: JSON.stringify({ image: payload.image, mask: payload.mask, width: payload.width, height: payload.height, prompt })
      })
      const imageBase64 = await parseRenderResponse(response)
      setCleanHistory(prev => [...prev, photo].slice(-8))
      setPhoto(`data:image/jpeg;base64,${imageBase64}`)
      resetCleanMask()
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Clean Slate failed.')
    } finally {
      setCleaning(false)
    }
  }

  function undoCleanPass() {
    if (!cleanHistory.length || cleaning) return
    const next = [...cleanHistory]
    const previous = next.pop()!
    setCleanHistory(next)
    setPhoto(previous)
    resetCleanMask()
    setRenderError(null)
  }

  function resetToOriginal() {
    if (!originalPhoto || cleaning) return
    setPhoto(originalPhoto)
    setCleanHistory([])
    resetCleanMask()
    setRenderError(null)
  }

  function exportConcept() {
    if (!photo) return
    const bg = new Image()
    bg.onload = () => {
      try {
        const frame = measureEditorFrame(bg)
        const placements = measurePlacements(frame)
        const { width: w, height: h } = canonicalCanvasSize(frame, 1800)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        if (!ctx) return
        drawEditorCrop(ctx, bg, frame, w, h)

        const jobs = plants.map((p, index) => new Promise<void>((resolve) => {
          const placement = placements[index]
          const img = new Image()
          img.onload = () => {
            const pw = (placement.widthPercent / 100) * w
            const ph = (placement.heightPercent / 100) * h
            const cx = (placement.centerXPercent / 100) * w
            const cy = (placement.centerYPercent / 100) * h

            ctx.save()
            ctx.globalAlpha = p.opacity
            if (p.flipX) {
              ctx.translate(cx * 2, 0)
              ctx.scale(-1, 1)
            }
            ctx.drawImage(img, cx - pw / 2, cy - ph / 2, pw, ph)
            ctx.restore()
            resolve()
          }
          img.onerror = () => resolve()
          img.src = p.src
        }))

        Promise.all(jobs).then(() => {
          const a = document.createElement('a')
          a.download = `${(customer || 'GreenScape-Concept').replace(/[^a-z0-9]+/gi,'-')}.png`
          a.href = c.toDataURL('image/png', .94)
          a.click()
        })
      } catch (err) {
        setRenderError(err instanceof Error ? err.message : 'Could not export the exact layout.')
      }
    }
    bg.src = photo
  }

  function buildRenderPayload(): Promise<{ image: string; mask: string; width: number; height: number; placements: RenderPlacement[] }> {
    return new Promise((resolve, reject) => {
      if (!photo) return reject(new Error('No jobsite photo loaded.'))

      const bg = new Image()
      bg.onload = () => {
        try {
          const frame = measureEditorFrame(bg)
          const placements = measurePlacements(frame)
          const { width: w, height: h } = canonicalCanvasSize(frame, 1050)

          const layout = document.createElement('canvas')
          layout.width = w
          layout.height = h
          const ctx = layout.getContext('2d')
          if (!ctx) return reject(new Error('Canvas is unavailable.'))
          drawEditorCrop(ctx, bg, frame, w, h)

          const maskCanvas = document.createElement('canvas')
          maskCanvas.width = w
          maskCanvas.height = h
          const maskCtx = maskCanvas.getContext('2d')
          if (!maskCtx) return reject(new Error('Mask canvas is unavailable.'))
          maskCtx.fillStyle = '#ffffff'
          maskCtx.fillRect(0, 0, w, h)

          const jobs = plants.map((p, index) => new Promise<void>((done) => {
            const placement = placements[index]
            const img = new Image()
            img.onload = () => {
              const pw = (placement.widthPercent / 100) * w
              const ph = (placement.heightPercent / 100) * h
              const cx = (placement.centerXPercent / 100) * w
              const cy = (placement.centerYPercent / 100) * h

              ctx.save()
              ctx.globalAlpha = Math.min(.18, p.shadow + .02)
              ctx.fillStyle = '#000'
              ctx.beginPath()
              ctx.ellipse(cx, cy + ph * .42, pw * .29, Math.max(2, ph * .03), 0, 0, Math.PI * 2)
              ctx.fill()
              ctx.globalAlpha = p.opacity
              if (p.flipX) {
                ctx.translate(cx * 2, 0)
                ctx.scale(-1, 1)
              }
              ctx.drawImage(img, cx - pw / 2, cy - ph / 2, pw, ph)
              ctx.restore()

              maskCtx.save()
              maskCtx.globalCompositeOperation = 'destination-out'
              if (p.flipX) {
                maskCtx.translate(cx * 2, 0)
                maskCtx.scale(-1, 1)
              }
              maskCtx.drawImage(img, cx - pw / 2, cy - ph / 2, pw, ph)
              maskCtx.restore()

              maskCtx.save()
              maskCtx.globalCompositeOperation = 'destination-out'
              maskCtx.beginPath()
              maskCtx.ellipse(cx, cy + ph * .43, Math.max(5, pw * .30), Math.max(3, ph * .055), 0, 0, Math.PI * 2)
              maskCtx.fill()
              maskCtx.restore()
              done()
            }
            img.onerror = () => done()
            img.src = p.src
          }))

          Promise.all(jobs).then(() => {
            resolve({
              image: layout.toDataURL('image/png'),
              mask: maskCanvas.toDataURL('image/png'),
              width: w,
              height: h,
              placements
            })
          })
        } catch (err) {
          reject(err)
        }
      }
      bg.onerror = () => reject(new Error('Could not load the jobsite photo.'))
      bg.src = photo
    })
  }

  async function renderDesign() {
    if (!photo) return
    setRendering(true)
    setRenderError(null)
    setRenderedImage(null)

    try {
      const renderPayload = await buildRenderPayload()
      const plantSummary = plants.length
        ? plants.map(p => p.name).join(', ')
        : 'the proposed landscaping elements'

      const speciesCounts = plants.reduce<Record<string, number>>((counts, plant) => {
        counts[plant.name] = (counts[plant.name] || 0) + 1
        return counts
      }, {})
      const countSummary = Object.entries(speciesCounts)
        .map(([name, count]) => `${count} × ${name}`)
        .join(', ')

      const placementManifest = renderPayload.placements.map(placement => {
        const asset = assets.find(a => a.key === placement.assetKey)
        const identity = asset?.cultivar
          ? `${placement.name} (${asset.cultivar}; ${asset.category})`
          : placement.name
        return [
          `P${placement.order} [id ${placement.id}] = ${identity}`,
          `left-to-right rank ${placement.leftToRightRank} of ${renderPayload.placements.length}`,
          `center ${placement.centerXPercent.toFixed(2)}% x / ${placement.centerYPercent.toFixed(2)}% y`,
          `bounding box L${placement.leftPercent.toFixed(2)} T${placement.topPercent.toFixed(2)} R${placement.rightPercent.toFixed(2)} B${placement.bottomPercent.toFixed(2)}`,
          `box size ${placement.widthPercent.toFixed(2)}% wide × ${placement.heightPercent.toFixed(2)}% tall`,
          `editor scale ${placement.scale.toFixed(2)}`,
          `orientation ${placement.flipX ? 'mirrored' : 'original'}`,
          'visible specimen/color must match the supplied cutout'
        ].join('; ')
      }).join(' | ')

      const prompt = [
        'Perform a localized photorealistic landscaping edit on this exact property photograph.',
        'CANONICAL FRAME LOCK: this input image is already cropped to the exact frame the designer saw in GreenScape. Preserve every image edge and the complete framing exactly; do not zoom out, zoom in, reveal hidden source-photo content, extend the scene, or change aspect ratio.',
        'HARD BLUEPRINT MODE: the supplied layout is a construction plan, not inspiration. Geometry and instance identity take priority over artistic interpretation.',
        `EXACT INSTANCE COUNT: output exactly ${plants.length} designed plant instance${plants.length === 1 ? '' : 's'} and no additional designed plants. Required count by type: ${countSummary || plantSummary}.`,
        'CRITICAL PRESERVATION RULE: pixels outside the transparent mask are protected reference content and must remain visually unchanged.',
        'Do not redesign, rebuild, restyle, recolor, move, resize, or reinterpret the house or any architecture.',
        'Preserve exactly: rooflines, siding and brick colors, windows, doors, trim, gutters, foundation, driveway, sidewalk, road, lawn, existing trees, utility items, neighboring scenery, sky, camera position, lens perspective, framing, and lighting.',
        `Inside each editable masked plant silhouette, photorealize THAT SAME individual plant in place. Included plants: ${plantSummary}.`,
        `STRICT PER-INSTANCE PLACEMENT MANIFEST: ${placementManifest}`,
        'INSTANCE LOCK: every P-number is a separate physical specimen. One listed instance must become exactly one output instance. Never combine, merge, split, duplicate, omit, substitute, or reorder instances.',
        'SEPARATION LOCK: preserve the original visible background/gaps between adjacent specimens. Do not bridge neighboring shrubs with foliage, stems, trunks, flowers, shadows, or newly invented vegetation. Protected pixels between masks are hard separators.',
        'IDENTITY LOCK: preserve each cutout species, cultivar cues, dominant foliage color, flower color, and basic growth habit. A blue flowering hydrangea must remain blue-flowering; a boxwood must remain a boxwood; a grass must remain a grass; a crepe myrtle must remain the same tree type and flower color shown.',
        'GEOMETRY LOCK: the manifest bounding boxes were measured directly from the designer-visible plant images. Keep each plant center at the manifest center and keep its outer footprint inside that exact measured box as closely as natural detail allows. Target width and height within about 3% of the supplied cutout. Do not enlarge a young/small specimen into a more mature specimen.',
        'ORDER LOCK: preserve the manifest left-to-right ranks exactly, plus the existing foreground/background relationships. No plant may cross another plant center or occupy another instance box.',
        'Treat the visible cutout as a tracing/template: improve realism, foliage detail, stems, lighting, edge integration and grounding while retaining the same silhouette, footprint, maturity, and orientation as closely as possible.',
        'If photorealism conflicts with exact count, identity, spacing, center position, or footprint, choose exact layout fidelity.',
        'Render complete botanical structure only inside each instance footprint where applicable, including trunks, stems, lower foliage, branching, and natural contact with the ground.',
        'Blend only the new plant into the existing photograph using matching sunlight, shadows, depth, sharpness, and color temperature.',
        'Do not invent landscape beds, mulch, rock, edging, flowers, furniture, ornaments, structures, filler plants, groundcover, or any other elements.',
        'The final result must look like the exact GreenScape editor frame with only the explicitly listed proposed plant instances realistically substituted into their exact measured locations.'
      ].join(' ')

      const response = await fetch('/api/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenAI-Key': ensureOpenAIKey()
        },
        body: JSON.stringify({ image: renderPayload.image, mask: renderPayload.mask, width: renderPayload.width, height: renderPayload.height, prompt })
      })
      const imageBase64 = await parseRenderResponse(response)
      setRenderedImage(`data:image/jpeg;base64,${imageBase64}`)
      setRenderNotice(true)
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'AI render failed.')
    } finally {
      setRendering(false)
    }
  }

  function clearProject() {
    setCustomer('')
    setAddress('')
    setOriginalPhoto(null)
    setPhoto(null)
    setPlants([])
    setCleanHistory([])
    resetCleanMask()
    setSelectedId(null)
    setScreen('home')
    setPresenting(false)
  }

  if (screen === 'home') {
    return <div className="app-shell">
      <header className="hero">
        <div className="brand-mark">GS</div>
        <div><h1>GreenScape</h1><p>Landscape Mockup Studio</p></div>
      </header>

      <section className="welcome-card">
        <span className="eyebrow">FIELD DESIGN TOOL</span>
        <h2>From jobsite photo to client-ready concept.</h2>
        <p>Capture. Clean. Place. Present. Export.</p>
      </section>

      <main className="grid-actions">
        <button className="action primary" onClick={() => setScreen('project')}><span>＋</span><b>New Design</b><small>Start from a photo</small></button>
        <button className="action" onClick={() => setScreen('gallery')}><span>▣</span><b>Open Project</b><small>Recent concepts</small></button>
        <button className="action" onClick={() => setScreen('library')}><span>🌿</span><b>Plant Library</b><small>Favorites and import</small></button>
        <button className="action" onClick={() => setScreen('gallery')}><span>▤</span><b>Gallery</b><small>Finished designs</small></button>
      </main>
      <footer className="bottom-note">GreenScape v0.3.9 • Selective Clean Slate</footer>
    </div>
  }

  if (screen === 'project') {
    return <div className="app-shell">
      <TopBar title="New Design" onBack={() => setScreen('home')} />
      <main className="panel stack">
        <label>Customer / Project<input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="e.g. Smith Residence" /></label>
        <label>Address<input value={address} onChange={e => setAddress(e.target.value)} placeholder="Optional for now" /></label>
        <div className="photo-pick">
          <h3>Add a jobsite photo</h3>
          <p>Take a fresh photo or import one already on the tablet.</p>
          <div className="photo-choice-grid">
            <button className="primary-btn big-choice" onClick={() => cameraRef.current?.click()}>
              <span>📷</span><b>Take New Photo</b><small>Open the camera</small>
            </button>
            <button className="big-choice" onClick={() => galleryRef.current?.click()}>
              <span>🖼️</span><b>Choose From Gallery</b><small>Use an existing photo</small>
            </button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e => onPhoto(e.target.files?.[0])} />
          <input ref={galleryRef} type="file" accept="image/*" hidden onChange={e => onPhoto(e.target.files?.[0])} />
        </div>
      </main>
    </div>
  }

  if (screen === 'editor') {
    return <div className={`editor-shell ${presenting ? 'presentation' : ''} ${activeTool === 'clean' ? 'clean-active' : ''}`}>
      {!presenting && <TopBar title={customer || 'Untitled Design'} onBack={() => setScreen('home')} />}
      <div className="canvas-wrap" ref={canvasRef} onPointerDown={() => setSelectedId(null)}>
        {photo ? <img src={photo} className="job-photo" /> : <div className="empty-photo">No photo</div>}
        {plants.map(p => <div
          key={p.id}
          className={`plant-object ${selectedId === p.id ? 'selected' : ''}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, opacity: p.opacity, transform: `translate(-50%, -50%) scale(${p.flipX ? -p.scale : p.scale}, ${p.scale})` }}
          onPointerDown={e => beginDrag(e, p)}
        >
          <span className="ground-shadow" style={{ opacity: p.shadow }} />
          <img src={p.src} alt={p.name} draggable={false} data-plant-id={p.id} />
          {!presenting && selectedId === p.id && <span className="plant-label">{p.name}</span>}
        </div>)}
        {!presenting && activeTool === 'clean' && <canvas
          ref={cleanMaskRef}
          className={`clean-mask-canvas ${cleanMode}`}
          aria-label="Clean Slate selection brush"
          onPointerDown={startCleanStroke}
          onPointerMove={moveCleanStroke}
          onPointerUp={endCleanStroke}
          onPointerCancel={endCleanStroke}
        />}
        {presenting && <button className="exit-present" onClick={() => setPresenting(false)}>Exit Presentation</button>}
      </div>

      {!presenting && <>
        <div className="tool-tabs">
          {(['clean','bed','plants','preview'] as Tool[]).map(t =>
            <button key={t} className={activeTool === t ? 'active' : ''} onClick={() => setActiveTool(t)}>
              {t === 'clean' ? 'Clean' : t === 'bed' ? 'Bed' : t === 'plants' ? 'Plants' : 'Preview'}
            </button>)}
        </div>

        <div className="tool-panel">
          {activeTool === 'clean' && <>
            <div className="clean-heading">
              <div><h3>Clean Slate</h3><small>Paint over one item, several items, or every area you want removed.</small></div>
              <span className={`working-image-badge ${isCleaned ? 'cleaned' : ''}`}>{isCleaned ? 'Cleaned base' : 'Original base'}</span>
            </div>
            <p className="clean-help">The red overlay is the only area GreenScape may clean. Plants are hidden while you select so you can see the existing property clearly.</p>
            <div className="clean-controls">
              <label>Brush Size
                <input type="range" min="14" max="130" step="2" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} />
                <span>{brushSize}px</span>
              </label>
              <div className="clean-mode-buttons" aria-label="Clean selection mode">
                <button className={cleanMode === 'paint' ? 'active' : ''} onClick={() => setCleanMode('paint')}>Paint Selection</button>
                <button className={cleanMode === 'erase' ? 'active' : ''} onClick={() => setCleanMode('erase')}>Erase Selection</button>
              </div>
            </div>
            <div className="clean-actions">
              <button className="clean-primary" disabled={!cleanHasSelection || cleaning || rendering} onClick={cleanSelectedAreas}>{cleaning ? 'Removing…' : '✨ Remove Selected'}</button>
              <button disabled={!cleanUndoDepth || cleaning} onClick={undoCleanSelection}>Undo Brush</button>
              <button disabled={!cleanHasSelection || cleaning} onClick={clearCleanSelection}>Clear Selection</button>
              <button disabled={!cleanHistory.length || cleaning} onClick={undoCleanPass}>Undo Clean</button>
              <button disabled={!isCleaned || cleaning} onClick={resetToOriginal}>Reset to Original</button>
            </div>
          </>}
          {activeTool === 'bed' && <><h3>Bed Builder</h3><p>Draw bed edges and choose mulch or rock comes after Clean Slate.</p><button disabled>Draw Bed — staged</button></>}
          {activeTool === 'plants' && <>
            <div className="panel-heading">
              <div><h3>Quick Plant Dock</h3><small>Tap to add. Drag on the photo to move.</small></div>
              <button onClick={() => plantImportRef.current?.click()}>＋ Import PNG / Photo</button>
              <input ref={plantImportRef} type="file" accept="image/*" hidden onChange={e => importPlant(e.target.files?.[0])}/>
            </div>
            <div className="plant-grid">
              {assets.map(a => <button key={a.key} className="asset-button" onClick={() => addAsset(a)}>
                <img src={a.src} alt="" /><span><b>＋ {a.name}</b>{a.cultivar && <small>{a.cultivar}</small>}</span>
              </button>)}
            </div>
            {selected && <div className="selection-bar">
              <div><b>{selected.name}</b><small>Selected plant</small></div>
              <label>Size
                <input type="range" min=".45" max="2.6" step=".05" value={selected.scale}
                  onChange={e => updatePlant(selected.id, { scale: Number(e.target.value) })}/>
              </label>
              <label>Opacity
                <input type="range" min=".45" max="1" step=".05" value={selected.opacity}
                  onChange={e => updatePlant(selected.id, { opacity: Number(e.target.value) })}/>
              </label>
              <label>Shadow
                <input type="range" min="0" max=".5" step=".02" value={selected.shadow}
                  onChange={e => updatePlant(selected.id, { shadow: Number(e.target.value) })}/>
              </label>
              <button onClick={() => updatePlant(selected.id, { flipX: !selected.flipX })}>Mirror</button>
              <button onClick={duplicateSelected}>Duplicate</button>
              <button className="danger" onClick={deleteSelected}>Delete</button>
            </div>}
          </>}
          {activeTool === 'preview' && <>
            <h3>Client Presentation</h3>
            <p>Hide every tool and show only the proposed design.</p>
            <button className="primary-btn" onClick={() => setPresenting(true)}>Present Full Screen</button>
          </>}
        </div>

        <div className="editor-footer">
          <button onClick={() => { setPlants([]); setSelectedId(null) }}>Clear Plants</button>
          <div className="footer-actions">
            <button className="render-btn" disabled={rendering || cleaning || plants.length === 0} onClick={renderDesign}>{rendering ? 'Rendering…' : '✨ Render Design'}</button>
            <button className="primary-btn" disabled={cleaning} onClick={exportConcept}>Export Layout PNG</button>
          </div>
        </div>
        {cleaning && <div className="render-toast clean-toast">
          <b>Cleaning selected areas…</b>
          <span>GreenScape is removing only the red-marked areas and rebuilding the background.</span>
        </div>}
        {rendering && <div className="render-toast">
          <b>Rendering photoreal design…</b>
          <span>GreenScape is blending your exact editor frame into a photoreal result.</span>
        </div>}
        {renderError && <div className="render-toast error-toast">
          <b>GreenScape notice</b>
          <span>{renderError}</span>
        </div>}
        {renderedImage && <div className="render-result-overlay">
          <div className="render-result-card">
            <div className="render-result-head">
              <div><b>Photoreal Render</b><small>Customer-ready concept</small></div>
              <button onClick={() => { setRenderedImage(null); setRenderNotice(false) }}>✕</button>
            </div>
            <img src={renderedImage} alt="Photoreal GreenScape render" />
            <div className="render-result-actions">
              <button onClick={() => { setRenderedImage(null); setRenderNotice(false) }}>Back to Layout</button>
              <a className="primary-btn download-render" href={renderedImage} download={`${(customer || 'GreenScape-Render').replace(/[^a-z0-9]+/gi,'-')}.png`}>Save Render</a>
            </div>
          </div>
        </div>}
      </>}
    </div>
  }

  if (screen === 'library') {
    return <div className="app-shell">
      <TopBar title="Plant Library" onBack={() => setScreen('home')} />
      <main className="panel">
        <div className="panel-heading">
          <div><h2>Starter Favorites</h2><p>Prototype assets plus your own imports.</p></div>
        </div>
        <div className="library-grid">
          {assets.map(a => <div className="library-card" key={a.key}><img src={a.src} alt={a.name}/><b>{a.name}</b><small>{a.cultivar ? `${a.cultivar} • ${a.category}` : a.category}</small></div>)}
        </div>
      </main>
    </div>
  }

  return <div className="app-shell">
    <TopBar title="Projects & Gallery" onBack={() => setScreen('home')} />
    <main className="panel stack">
      <h2>No saved projects yet</h2>
      <p>GreenScape is still local-first. Saved Projects comes after Clean Slate is proven in field use.</p>
      <button className="primary-btn" onClick={() => setScreen('project')}>Start New Design</button>
      <button onClick={clearProject}>Reset Prototype</button>
    </main>
  </div>
}

function TopBar({title,onBack}:{title:string,onBack:()=>void}) {
  return <header className="topbar"><button onClick={onBack}>←</button><b>{title}</b><span>GreenScape</span></header>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
