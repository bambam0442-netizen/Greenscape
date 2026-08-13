
import React, { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const OPENAI_LOCAL_KEY = 'greenscape_openai_api_key'
const getLocalOpenAIKey = () => localStorage.getItem(OPENAI_LOCAL_KEY) || ''
const setLocalOpenAIKey = (value: string) => localStorage.setItem(OPENAI_LOCAL_KEY, value.trim())

type Screen = 'home' | 'project' | 'editor' | 'library' | 'gallery'
type Tool = 'clean' | 'bed' | 'plants' | 'preview'

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

function svgData(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
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
  const [photo, setPhoto] = useState<string | null>(null)
  const [plants, setPlants] = useState<Plant[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeTool, setActiveTool] = useState<Tool>('plants')
  const [presenting, setPresenting] = useState(false)
  const [renderNotice, setRenderNotice] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [renderedImage, setRenderedImage] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const plantImportRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => plants.find(p => p.id === selectedId) || null, [plants, selectedId])

  function onPhoto(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPhoto(String(reader.result))
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

  function beginDrag(e: React.PointerEvent, plant: Plant) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(plant.id)
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
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

  function exportConcept() {
    if (!photo) return
    const bg = new Image()
    bg.onload = () => {
      const maxW = 1800
      const scaleDown = Math.min(1, maxW / bg.naturalWidth)
      const w = Math.round(bg.naturalWidth * scaleDown)
      const h = Math.round(bg.naturalHeight * scaleDown)
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(bg, 0, 0, w, h)

      const jobs = plants.map(p => new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => {
          const base = Math.min(w, h) * .18 * p.scale
          const ratio = img.naturalWidth / Math.max(1, img.naturalHeight)
          const pw = ratio >= 1 ? base : base * ratio
          const ph = ratio >= 1 ? base / ratio : base
          const cx = (p.x / 100) * w
          const cy = (p.y / 100) * h
          ctx.drawImage(img, cx - pw / 2, cy - ph / 2, pw, ph)
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
    }
    bg.src = photo
  }

  function buildRenderPayload(): Promise<{ image: string; mask: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      if (!photo) return reject(new Error('No jobsite photo loaded.'))

      const bg = new Image()
      bg.onload = () => {
        // Keep the request compact while preserving the original aspect ratio.
        const maxW = 1100
        const maxH = 1100
        const scaleDown = Math.min(1, maxW / bg.naturalWidth, maxH / bg.naturalHeight)
        const w = Math.max(1, Math.round(bg.naturalWidth * scaleDown))
        const h = Math.max(1, Math.round(bg.naturalHeight * scaleDown))

        const layout = document.createElement('canvas')
        layout.width = w
        layout.height = h
        const ctx = layout.getContext('2d')
        if (!ctx) return reject(new Error('Canvas is unavailable.'))
        ctx.drawImage(bg, 0, 0, w, h)

        // Opaque mask = protected pixels. Transparent holes = areas AI may edit.
        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = w
        maskCanvas.height = h
        const maskCtx = maskCanvas.getContext('2d')
        if (!maskCtx) return reject(new Error('Mask canvas is unavailable.'))
        maskCtx.fillStyle = '#ffffff'
        maskCtx.fillRect(0, 0, w, h)

        const jobs = plants.map(p => new Promise<void>((done) => {
          const img = new Image()
          img.onload = () => {
            const base = Math.min(w, h) * .18 * p.scale
            const ratio = img.naturalWidth / Math.max(1, img.naturalHeight)
            const pw = ratio >= 1 ? base : base * ratio
            const ph = ratio >= 1 ? base / ratio : base
            const cx = (p.x / 100) * w
            const cy = (p.y / 100) * h

            // Draw the rough plant cue into the editable image.
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

            // STRICT LAYOUT MASK: edit the plant silhouette itself instead of a large box.
            // The previous rectangular holes gave the model enough freedom to move/swap plants.
            // Using each cutout's alpha channel makes position + scale a hard visual constraint.
            maskCtx.save()
            maskCtx.globalCompositeOperation = 'destination-out'
            if (p.flipX) {
              maskCtx.translate(cx * 2, 0)
              maskCtx.scale(-1, 1)
            }
            maskCtx.drawImage(img, cx - pw / 2, cy - ph / 2, pw, ph)
            maskCtx.restore()

            // Allow only a very small grounding zone under the exact plant position so the
            // renderer can create contact shadow/stems without relocating the specimen.
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
            height: h
          })
        })
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
      const placementManifest = plants.map((p, i) =>
        `Plant ${i + 1}: ${p.name}; center ${p.x.toFixed(1)}% from left, ${p.y.toFixed(1)}% from top; relative scale ${p.scale.toFixed(2)}.`
      ).join(' ')

      const prompt = [
        'Perform a localized photorealistic landscaping edit on this exact property photograph.',
        'CRITICAL PRESERVATION RULE: pixels outside the transparent mask are protected reference content and must remain visually unchanged.',
        'Do not redesign, rebuild, restyle, recolor, move, resize, or reinterpret the house or any architecture.',
        'Preserve exactly: rooflines, siding and brick colors, windows, doors, trim, gutters, foundation, driveway, sidewalk, road, lawn, existing trees, utility items, neighboring scenery, sky, camera position, lens perspective, framing, and lighting.',
        `Inside each editable masked plant silhouette, photorealize THAT SAME plant in place. Included plants: ${plantSummary}.`,
        `STRICT PLACEMENT MANIFEST: ${placementManifest}`,
        'The layout is a construction plan, not inspiration. One input plant must become one output plant. Do not swap species, reorder plants, combine plants, duplicate plants, omit plants, or move a plant into another plant area.',
        'Keep every plant center fixed to its supplied center. Keep its overall width and height within about 5% of the supplied cutout. Preserve left-to-right order and foreground/background relationships exactly.',
        'Treat the visible cutout as a tracing/template: improve realism, foliage detail, stems, lighting, edge integration and grounding while preserving its footprint and silhouette as closely as natural growth allows.',
        'Render complete botanical structure where applicable, including trunks, stems, lower foliage, branching, and natural contact with the ground.',
        'Blend only the new plant into the existing photograph using matching sunlight, shadows, depth, sharpness, and color temperature.',
        'Do not invent landscape beds, mulch, rock, edging, flowers, furniture, ornaments, structures, or any other elements.',
        'The final result must look like the original customer photo with only the proposed plants realistically substituted into the marked locations.'
      ].join(' ')

      const localKey = getLocalOpenAIKey()
      if (!localKey) {
        const entered = window.prompt('Paste your OpenAI API key once. It stays in this browser and is not saved in the GreenScape project.')
        if (!entered) throw new Error('Render cancelled: OpenAI API key is required.')
        setLocalOpenAIKey(entered)
      }
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenAI-Key': getLocalOpenAIKey(),
        },
        body: JSON.stringify({ image: renderPayload.image, mask: renderPayload.mask, width: renderPayload.width, height: renderPayload.height, prompt })
      })

      const raw = await response.text()
      let data: any = null

      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}: ${raw.slice(0, 180) || 'Render request failed.'}`)
        }
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

      setRenderedImage(`data:image/jpeg;base64,${data.image}`)
      setRenderNotice(true)
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'AI render failed.')
    } finally {
      setRendering(false)
    }
  }

  function clearProject() {
    setCustomer(''); setAddress(''); setPhoto(null); setPlants([])
    setSelectedId(null); setScreen('home'); setPresenting(false)
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
        <p>Capture. Place natural plant cutouts. Present. Export.</p>
      </section>

      <main className="grid-actions">
        <button className="action primary" onClick={() => setScreen('project')}><span>＋</span><b>New Design</b><small>Start from a photo</small></button>
        <button className="action" onClick={() => setScreen('gallery')}><span>▣</span><b>Open Project</b><small>Recent concepts</small></button>
        <button className="action" onClick={() => setScreen('library')}><span>🌿</span><b>Plant Library</b><small>Favorites and import</small></button>
        <button className="action" onClick={() => setScreen('gallery')}><span>▤</span><b>Gallery</b><small>Finished designs</small></button>
      </main>
      <footer className="bottom-note">GreenScape v0.3.6 • Strict layout render</footer>
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
    return <div className={`editor-shell ${presenting ? 'presentation' : ''}`}>
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
          <img src={p.src} alt={p.name} draggable={false}  />
          {!presenting && selectedId === p.id && <span className="plant-label">{p.name}</span>}
        </div>)}
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
          {activeTool === 'clean' && <><h3>Clean Slate</h3><p>Starter plants are prepared before they enter GreenScape, so you only place, size, and arrange them.</p><button disabled>Erase Brush — next build</button></>}
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
            <button className="render-btn" disabled={rendering || plants.length === 0} onClick={renderDesign}>{rendering ? "Rendering…" : "✨ Render Design"}</button>
            <button className="primary-btn" onClick={exportConcept}>Export Layout PNG</button>
          </div>
        </div>
        {rendering && <div className="render-toast">
          <b>Rendering photoreal design…</b>
          <span>GreenScape is blending your layout into the original property photo.</span>
        </div>}
        {renderError && <div className="render-toast error-toast">
          <b>Render failed</b>
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
      <p>V0.2.2 still keeps the workflow local. Supabase saving comes after Clean Slate and Bed Builder are proven.</p>
      <button className="primary-btn" onClick={() => setScreen('project')}>Start New Design</button>
      <button onClick={clearProject}>Reset Prototype</button>
    </main>
  </div>
}

function TopBar({title,onBack}:{title:string,onBack:()=>void}) {
  return <header className="topbar"><button onClick={onBack}>←</button><b>{title}</b><span>GreenScape</span></header>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
