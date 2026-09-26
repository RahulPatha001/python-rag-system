const CHAT_STORAGE_KEY = 'sift.rag.chats.v1'
const DOCUMENT_STORAGE_KEY = 'sift.rag.documents.v1'

function readStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch (error) {
    console.warn(`Unable to read ${key} from local storage.`, error)
    return fallback
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn(`Unable to persist ${key} in local storage.`, error)
  }
}

export function createId(prefix = 'item') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function loadChats() {
  const value = readStorage(CHAT_STORAGE_KEY, [])
  return Array.isArray(value) ? value : []
}

export function saveChats(chats) {
  writeStorage(CHAT_STORAGE_KEY, chats)
}

export function loadDocuments() {
  const value = readStorage(DOCUMENT_STORAGE_KEY, [])
  return Array.isArray(value) ? value : []
}

export function saveDocuments(documents) {
  writeStorage(DOCUMENT_STORAGE_KEY, documents)
}
