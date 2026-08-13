(() => {
  const STORAGE_KEY = 'greenscape_openai_api_key'
  const BUTTON_ID = 'greenscape-openai-key-button'
  const DIALOG_ID = 'greenscape-openai-key-dialog'

  function hasKey() {
    try {
      return Boolean((localStorage.getItem(STORAGE_KEY) || '').trim())
    } catch {
      return false
    }
  }

  function updateButton() {
    const button = document.getElementById(BUTTON_ID)
    if (!button) return
    const saved = hasKey()
    button.textContent = saved ? '🔑 OpenAI Key ✓' : '🔑 Add OpenAI Key'
    button.setAttribute('aria-label', saved ? 'OpenAI API key saved. Tap to replace or clear it.' : 'Add OpenAI API key')
    button.style.borderColor = saved ? '#3e8150' : '#805f31'
  }

  function closeDialog() {
    document.getElementById(DIALOG_ID)?.remove()
  }

  function openDialog() {
    closeDialog()

    const saved = hasKey()
    const overlay = document.createElement('div')
    overlay.id = DIALOG_ID
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'OpenAI API key settings')
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:10000', 'display:grid', 'place-items:center',
      'padding:18px', 'background:rgba(3,7,5,.86)', 'font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';')

    const card = document.createElement('div')
    card.style.cssText = [
      'width:min(520px,96vw)', 'background:#0f1712', 'color:#eef4ef', 'border:1px solid #31483a',
      'border-radius:20px', 'padding:20px', 'box-shadow:0 28px 90px rgba(0,0,0,.72)'
    ].join(';')

    const title = document.createElement('h2')
    title.textContent = 'OpenAI API Key'
    title.style.cssText = 'margin:0 0 6px;font-size:1.35rem'

    const status = document.createElement('div')
    status.textContent = saved ? '✓ A key is saved on this device.' : 'No key is saved on this device.'
    status.style.cssText = `margin:0 0 16px;font-weight:700;color:${saved ? '#8fd39d' : '#e2bd79'}`

    const help = document.createElement('p')
    help.textContent = saved
      ? 'Paste a new key below to replace the saved key, or use Clear Saved Key. Your current key is never displayed here.'
      : 'Paste your OpenAI API key below. GreenScape stores it only in this browser on this device.'
    help.style.cssText = 'margin:0 0 14px;color:#a9b7ae;line-height:1.45'

    const input = document.createElement('input')
    input.type = 'password'
    input.placeholder = 'sk-...'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.style.cssText = [
      'width:100%', 'padding:14px 15px', 'border-radius:12px', 'border:1px solid #3a4b40',
      'background:#0a100c', 'color:#f5f8f6', 'font:inherit', 'outline:none'
    ].join(';')

    const revealRow = document.createElement('label')
    revealRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:10px 0 18px;color:#a9b7ae;font-size:.9rem'
    const reveal = document.createElement('input')
    reveal.type = 'checkbox'
    reveal.addEventListener('change', () => {
      input.type = reveal.checked ? 'text' : 'password'
    })
    revealRow.append(reveal, document.createTextNode('Show what I type'))

    const message = document.createElement('div')
    message.style.cssText = 'min-height:20px;margin:-4px 0 12px;color:#ff9d9d;font-size:.9rem'

    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap'

    function makeButton(label, css) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.style.cssText = `padding:11px 14px;border-radius:12px;border:1px solid #35483b;background:#172119;color:#eef4ef;font:inherit;cursor:pointer;${css || ''}`
      return button
    }

    const cancel = makeButton('Cancel')
    cancel.addEventListener('click', closeDialog)

    if (saved) {
      const clear = makeButton('Clear Saved Key', 'border-color:#704046;background:#2a1719;color:#ffb0b0')
      clear.addEventListener('click', () => {
        if (!window.confirm('Clear the OpenAI API key saved in this browser?')) return
        localStorage.removeItem(STORAGE_KEY)
        updateButton()
        closeDialog()
        window.alert('OpenAI API key cleared from this device.')
      })
      actions.append(clear)
    }

    const save = makeButton(saved ? 'Replace Key' : 'Save Key', 'border-color:#3e8150;background:#245d34;color:white;font-weight:800')
    save.addEventListener('click', () => {
      const value = input.value.trim()
      if (!value) {
        message.textContent = 'Paste a key first.'
        input.focus()
        return
      }
      if (!value.startsWith('sk-')) {
        message.textContent = 'That does not look like an OpenAI API key. Check it and try again.'
        input.focus()
        return
      }
      localStorage.setItem(STORAGE_KEY, value)
      input.value = ''
      updateButton()
      closeDialog()
      window.alert('OpenAI API key saved on this device. GreenScape will use it for renders.')
    })

    actions.append(cancel, save)
    card.append(title, status, help, input, revealRow, message, actions)
    overlay.append(card)

    overlay.addEventListener('pointerdown', event => {
      if (event.target === overlay) closeDialog()
    })
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeDialog()
      if (event.key === 'Enter' && document.activeElement === input) save.click()
    })

    document.body.append(overlay)
    setTimeout(() => input.focus(), 0)
  }

  function mount() {
    if (document.getElementById(BUTTON_ID)) return
    const button = document.createElement('button')
    button.id = BUTTON_ID
    button.type = 'button'
    button.addEventListener('click', openDialog)
    button.style.cssText = [
      'position:fixed', 'left:calc(14px + env(safe-area-inset-left))', 'bottom:calc(14px + env(safe-area-inset-bottom))',
      'z-index:9000', 'padding:10px 13px', 'border-radius:999px', 'border:1px solid #805f31',
      'background:rgba(14,22,17,.96)', 'color:#eef4ef', 'font:700 13px Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 8px 26px rgba(0,0,0,.42)', 'cursor:pointer', 'backdrop-filter:blur(8px)'
    ].join(';')
    document.body.append(button)
    updateButton()

    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY) updateButton()
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }
})()
