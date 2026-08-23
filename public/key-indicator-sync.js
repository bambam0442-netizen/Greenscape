(() => {
  const STORAGE_KEY = 'greenscape_openai_api_key'
  const BUTTON_ID = 'greenscape-openai-key-button'

  function hasKey() {
    try {
      return Boolean((localStorage.getItem(STORAGE_KEY) || '').trim())
    } catch {
      return false
    }
  }

  function syncButton() {
    const button = document.getElementById(BUTTON_ID)
    if (!button) return
    const saved = hasKey()
    button.textContent = saved ? '🔑 OpenAI Key ✓' : '🔑 Add OpenAI Key'
    button.setAttribute('aria-label', saved ? 'OpenAI API key saved. Tap to replace or clear it.' : 'Add OpenAI API key')
    button.style.borderColor = saved ? '#3e8150' : '#805f31'
  }

  const proto = window.Storage && window.Storage.prototype
  if (proto && !window.__greenscapeKeyIndicatorStorageHook) {
    const previousSetItem = proto.setItem
    const previousRemoveItem = proto.removeItem

    proto.setItem = function syncedSetItem(key, value) {
      const result = previousSetItem.call(this, key, value)
      if (key === STORAGE_KEY) queueMicrotask(syncButton)
      return result
    }

    proto.removeItem = function syncedRemoveItem(key) {
      const result = previousRemoveItem.call(this, key)
      if (key === STORAGE_KEY) queueMicrotask(syncButton)
      return result
    }

    window.__greenscapeKeyIndicatorStorageHook = true
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncButton, { once: true })
  } else {
    syncButton()
  }

  window.addEventListener('pageshow', syncButton)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncButton()
  })
})()
