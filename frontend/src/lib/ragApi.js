const DEFAULT_BASE_URL = '/api'
const DEFAULT_UPLOAD_ENDPOINT = '/upload'
const DEFAULT_QUERY_ENDPOINT = '/query'
const DEFAULT_HEALTH_ENDPOINT = '/health'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
const uploadEndpoint = import.meta.env.VITE_UPLOAD_ENDPOINT || DEFAULT_UPLOAD_ENDPOINT
const queryEndpoint = import.meta.env.VITE_QUERY_ENDPOINT || DEFAULT_QUERY_ENDPOINT
const healthEndpoint = import.meta.env.VITE_HEALTH_ENDPOINT || DEFAULT_HEALTH_ENDPOINT

export const API_CONFIG = {
  baseUrl,
  uploadEndpoint,
  queryEndpoint,
  healthEndpoint,
}

export class ApiError extends Error {
  constructor(message, { status = 0, details = null, cause } = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

function resolveUrl(endpoint) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
}

function formatDetail(detail) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean)
      .join('. ')
  }
  if (detail && typeof detail === 'object') return detail.message || detail.error || ''
  return ''
}

function parseError(response, payload) {
  const detail = formatDetail(payload?.detail) || formatDetail(payload?.message) || formatDetail(payload?.error)
  const statusText = response.statusText ? ` (${response.statusText})` : ''
  return new ApiError(detail || `The server could not complete the request${statusText}.`, {
    status: response.status,
    details: payload,
  })
}

async function readPayload(response) {
  const contentType = response.headers.get('content-type') || ''
  if (response.status === 204) return null
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

async function apiRequest(endpoint, { timeout = 30_000, signal, ...options } = {}) {
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', abortFromCaller, { once: true })
  }

  const timeoutId = window.setTimeout(() => controller.abort('timeout'), timeout)

  try {
    const response = await fetch(resolveUrl(endpoint), {
      ...options,
      signal: controller.signal,
    })
    const payload = await readPayload(response)
    if (!response.ok) throw parseError(response, payload)
    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted) {
      if (signal?.aborted) throw error
      throw new ApiError('The request took too long. Please try again.', { cause: error })
    }
    if (!navigator.onLine) {
      throw new ApiError('You appear to be offline. Check your connection and try again.', { cause: error })
    }
    throw new ApiError('Could not reach the RAG backend. Check that the server is running.', { cause: error })
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

function cleanFileName(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/^.*[\\/]/, '')
}

function toScore(value) {
  const score = Number(value)
  return Number.isFinite(score) ? score : null
}

function normalizeSource(source, index) {
  if (typeof source === 'string') {
    return {
      id: `source_${index}`,
      title: 'Retrieved passage',
      location: 'Document excerpt',
      content: source,
      score: null,
    }
  }

  const node = source?.node || source?.document || source
  const metadata = source?.metadata || node?.metadata || source?.extra_info || {}
  const content = source?.text || source?.content || source?.page_content || node?.text || node?.content || ''
  const rawTitle = source?.title || metadata.file_name || metadata.filename || metadata.source || metadata.title || source?.name || source?.file_name
  const title = cleanFileName(rawTitle) || 'Retrieved passage'
  const page = metadata.page_label || metadata.page_number || metadata.page
  const section = metadata.section || metadata.chunk_id || metadata.node_id
  const locationParts = []
  if (source?.location) locationParts.push(source.location)
  if (page !== undefined && page !== null && page !== '') locationParts.push(`Page ${page}`)
  if (section !== undefined && section !== null && section !== '') locationParts.push(String(section))

  return {
    id: source?.id || `source_${index}_${metadata.node_id || metadata.chunk_id || index}`,
    title,
    location: locationParts.join(' · ') || 'Document excerpt',
    content: String(content || '').trim(),
    score: toScore(source?.score ?? source?.similarity ?? metadata.score),
  }
}

function normalizeAnswer(payload) {
  const answer = payload?.answer ?? payload?.response ?? payload?.result ?? payload?.text ?? ''
  const rawSources = payload?.sources ?? payload?.source_documents ?? payload?.citations ?? []
  const sources = Array.isArray(rawSources) ? rawSources.map(normalizeSource) : []

  return {
    answer: String(answer || 'The backend returned an empty answer.').trim(),
    sources,
  }
}

export async function checkBackend({ signal } = {}) {
  await apiRequest(healthEndpoint, {
    method: 'GET',
    timeout: 8_000,
    signal,
    headers: { Accept: 'application/json' },
  })
  return true
}

export async function uploadDocument(file, { signal } = {}) {
  const formData = new FormData()
  formData.append('file', file)

  const payload = await apiRequest(uploadEndpoint, {
    method: 'POST',
    body: formData,
    signal,
    timeout: 120_000,
  })

  const uploadedName = payload?.filename || payload?.file_name || payload?.name || file.name
  return {
    id: payload?.document_id || payload?.id || null,
    name: cleanFileName(uploadedName) || file.name,
    ingested: Number(payload?.ingested) || 0,
    status: payload?.status || 'indexed',
    size: file.size,
    type: file.type,
    indexedAt: new Date().toISOString(),
    result: payload,
  }
}

export async function askQuestion(question, { signal } = {}) {
  const payload = await apiRequest(queryEndpoint, {
    method: 'POST',
    body: JSON.stringify({ question }),
    signal,
    timeout: 120_000,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  })

  return normalizeAnswer(payload)
}
