(() => {
  const KEY = 'greenscape_openai_api_key'
  const proto = window.Storage && window.Storage.prototype
  if (!proto || window.__greenscapeKeyStorageFallback) return

  const originalGetItem = proto.getItem
  const originalSetItem = proto.setItem
  const originalRemoveItem = proto.removeItem
  let memoryKey = ''

  function isLocal(storage) {
    try { return storage === window.localStorage } catch { return false }
  }

  function sessionRead() {
    try { return (originalGetItem.call(window.sessionStorage, KEY) || '').trim() } catch { return '' }
  }

  function sessionWrite(value) {
    try { originalSetItem.call(window.sessionStorage, KEY, value) } catch {}
  }

  function sessionClear() {
    try { originalRemoveItem.call(window.sessionStorage, KEY) } catch {}
  }

  proto.getItem = function patchedGetItem(key) {
    if (key !== KEY || !isLocal(this)) return originalGetItem.call(this, key)

    try {
      const value = originalGetItem.call(this, key)
      if (value && value.trim()) {
        memoryKey = value.trim()
        sessionWrite(memoryKey)
        return value
      }
    } catch {}

    const sessionValue = sessionRead()
    if (sessionValue) {
      memoryKey = sessionValue
      return sessionValue
    }
    return memoryKey || null
  }

  proto.setItem = function patchedSetItem(key, value) {
    if (key !== KEY || !isLocal(this)) return originalSetItem.call(this, key, value)

    const safeValue = String(value || '').trim()
    memoryKey = safeValue
    sessionWrite(safeValue)
    try { originalSetItem.call(this, key, safeValue) } catch {}
  }

  proto.removeItem = function patchedRemoveItem(key) {
    if (key !== KEY || !isLocal(this)) return originalRemoveItem.call(this, key)

    memoryKey = ''
    sessionClear()
    try { originalRemoveItem.call(this, key) } catch {}
  }

  window.__greenscapeKeyStorageFallback = true
})()
