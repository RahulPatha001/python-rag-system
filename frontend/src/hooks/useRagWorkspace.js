import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, askQuestion as requestAnswer, checkBackend, uploadDocument } from '../lib/ragApi.js'
import { createId, loadChats, loadDocuments, saveChats, saveDocuments } from '../lib/storage.js'

function createChat() {
  const now = new Date().toISOString()
  return {
    id: createId('chat'),
    title: 'New conversation',
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

function loadInitialChats() {
  const stored = loadChats()
    .filter((chat) => chat && typeof chat.id === 'string')
    .map((chat) => ({
      ...chat,
      title: chat.title || 'Untitled conversation',
      messages: Array.isArray(chat.messages)
        ? chat.messages
          .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
          .map((message) => ({
            ...message,
            sources: Array.isArray(message.sources) ? message.sources : [],
          }))
        : [],
      createdAt: chat.createdAt || new Date().toISOString(),
      updatedAt: chat.updatedAt || chat.createdAt || new Date().toISOString(),
    }))

  return stored.length > 0 ? stored : [createChat()]
}

function loadInitialDocuments() {
  return loadDocuments().filter((document) => (
    document && typeof document === 'object' && typeof document.name === 'string'
  ))
}

function getErrorMessage(error) {
  if (error?.name === 'AbortError') return 'The request was cancelled.'
  return error?.message || 'Something went wrong while contacting the backend.'
}

function useRagWorkspace() {
  const [chats, setChats] = useState(loadInitialChats)
  const [documents, setDocuments] = useState(loadInitialDocuments)
  const [selectedChatId, setSelectedChatId] = useState(null)
  const [question, setQuestion] = useState('')
  const [askingChatId, setAskingChatId] = useState(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [isSourcesOpen, setIsSourcesOpen] = useState(false)
  const [sourceViewSources, setSourceViewSources] = useState(null)
  const [selectedSourceId, setSelectedSourceId] = useState(null)
  const [toast, setToast] = useState(null)
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  const [backendReachable, setBackendReachable] = useState(() => (navigator.onLine ? null : false))
  const requestControllerRef = useRef(null)
  const healthControllerRef = useRef(null)
  const healthCheckStartedRef = useRef(false)
  const toastTimerRef = useRef(null)

  const activeChatId = chats.some((chat) => chat.id === selectedChatId) ? selectedChatId : chats[0]?.id
  const activeChat = chats.find((chat) => chat.id === activeChatId)

  const connectionStatus = useMemo(() => {
    if (!browserOnline) return 'offline'
    if (backendReachable === null) return 'checking'
    return backendReachable ? 'online' : 'unavailable'
  }, [backendReachable, browserOnline])

  useEffect(() => {
    saveChats(chats.slice(0, 40))
  }, [chats])

  useEffect(() => {
    saveDocuments(documents)
  }, [documents])

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true)
    const handleOffline = () => setBrowserOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const checkConnection = useCallback(async () => {
    healthControllerRef.current?.abort()
    const controller = new AbortController()
    healthControllerRef.current = controller

    if (!navigator.onLine) {
      setBrowserOnline(false)
      setBackendReachable(false)
      return false
    }

    setBackendReachable(null)
    try {
      await checkBackend({ signal: controller.signal })
      if (!controller.signal.aborted) setBackendReachable(true)
      return true
    } catch {
      if (controller.signal.aborted) return false
      setBrowserOnline(navigator.onLine)
      setBackendReachable(false)
      return false
    } finally {
      if (healthControllerRef.current === controller) healthControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (healthCheckStartedRef.current) return
    healthCheckStartedRef.current = true
    void checkConnection()
  }, [checkConnection])

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        const currentChat = chats.find((chat) => chat.id === activeChatId)
        if (currentChat?.messages.length === 0) {
          setSelectedChatId(currentChat.id)
          setQuestion('')
        } else {
          const chat = createChat()
          setChats((current) => [chat, ...current])
          setSelectedChatId(chat.id)
          setQuestion('')
        }
        setIsSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [activeChatId, chats])

  useEffect(() => () => {
    requestControllerRef.current?.abort()
    window.clearTimeout(toastTimerRef.current)
  }, [])

  const showToast = useCallback((message, type = 'success') => {
    window.clearTimeout(toastTimerRef.current)
    setToast({ id: Date.now(), message, type })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4500)
  }, [])

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimerRef.current)
    setToast(null)
  }, [])

  const createNewChat = useCallback(() => {
    if (activeChat?.messages.length === 0) {
      setSelectedChatId(activeChat.id)
    } else {
      const chat = createChat()
      setChats((current) => [chat, ...current])
      setSelectedChatId(chat.id)
    }
    setQuestion('')
    setSourceViewSources(null)
    setSelectedSourceId(null)
    setIsSourcesOpen(false)
    setIsSidebarOpen(false)
  }, [activeChat])

  const selectChat = useCallback((chatId) => {
    setSelectedChatId(chatId)
    setQuestion('')
    setSourceViewSources(null)
    setSelectedSourceId(null)
    setIsSourcesOpen(false)
    setIsSidebarOpen(false)
  }, [])

  const executeQuestion = useCallback(async (chatId, text, requestId, appendUserMessage) => {
    const controller = new AbortController()
    requestControllerRef.current?.abort()
    requestControllerRef.current = controller
    setAskingChatId(chatId)

    if (appendUserMessage) {
      const userMessage = {
        id: createId('message'),
        role: 'user',
        content: text,
        requestId,
        createdAt: new Date().toISOString(),
      }
      setChats((current) => current.map((chat) => chat.id === chatId ? {
        ...chat,
        title: chat.messages.length === 0 ? text.replace(/\s+/g, ' ').slice(0, 52) + (text.length > 52 ? '…' : '') : chat.title,
        messages: [...chat.messages, userMessage],
        updatedAt: new Date().toISOString(),
      } : chat))
    }

    try {
      const result = await requestAnswer(text, { signal: controller.signal })
      if (controller.signal.aborted) return
      setChats((current) => current.map((chat) => chat.id === chatId ? {
        ...chat,
        messages: [...chat.messages, {
          id: createId('message'),
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          requestId,
          createdAt: new Date().toISOString(),
        }],
        updatedAt: new Date().toISOString(),
      } : chat))
      setBackendReachable(true)
      setSourceViewSources(null)
    } catch (error) {
      if (controller.signal.aborted) return
      setChats((current) => current.map((chat) => chat.id === chatId ? {
        ...chat,
        messages: [...chat.messages, {
          id: createId('message'),
          role: 'assistant',
          content: getErrorMessage(error),
          sources: [],
          requestId,
          error: true,
          createdAt: new Date().toISOString(),
        }],
        updatedAt: new Date().toISOString(),
      } : chat))
      if (error instanceof ApiError && error.status === 0) {
        setBackendReachable(false)
      }
      if (error?.name !== 'AbortError' && !navigator.onLine) setBrowserOnline(false)
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
        setAskingChatId(null)
      }
    }
  }, [])

  const submitQuestion = useCallback(() => {
    const text = question.trim()
    if (!text || askingChatId || connectionStatus === 'offline' || connectionStatus === 'unavailable') return

    let chatId = activeChatId
    if (!chatId) {
      const chat = createChat()
      chatId = chat.id
      setChats((current) => [chat, ...current])
      setSelectedChatId(chat.id)
    }

    setQuestion('')
    void executeQuestion(chatId, text, createId('request'), true)
  }, [activeChatId, askingChatId, connectionStatus, executeQuestion, question])

  const cancelQuestion = useCallback(() => {
    if (!requestControllerRef.current) return
    requestControllerRef.current.abort()
    requestControllerRef.current = null
    setAskingChatId(null)
    showToast('Answer request cancelled.')
  }, [showToast])

  const retryQuestion = useCallback((messageId) => {
    if (!activeChat || askingChatId) return
    const errorIndex = activeChat.messages.findIndex((message) => message.id === messageId)
    const requestId = activeChat.messages[errorIndex]?.requestId
    const userMessage = activeChat.messages.slice(0, errorIndex).reverse().find((message) => message.role === 'user' && message.requestId === requestId)
    if (!userMessage) return

    setChats((current) => current.map((chat) => chat.id === activeChat.id ? {
      ...chat,
      messages: chat.messages.filter((message) => message.id !== messageId),
    } : chat))
    void executeQuestion(activeChat.id, userMessage.content, requestId, false)
  }, [activeChat, askingChatId, executeQuestion])

  const uploadFile = useCallback(async (file) => {
    try {
      const uploaded = await uploadDocument(file)
      setDocuments((current) => [{
        ...uploaded,
        id: uploaded.id || createId('document'),
      }, ...current])
      setBackendReachable(true)
      const chunkLabel = uploaded.ingested === 1 ? ' passage' : ' passages'
      showToast(`${uploaded.name} indexed with ${uploaded.ingested}${chunkLabel}.`)
      return uploaded
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) setBackendReachable(false)
      if (!navigator.onLine) setBrowserOnline(false)
      const message = getErrorMessage(error)
      showToast(message, 'error')
      throw new Error(message, { cause: error })
    }
  }, [showToast])

  const openSources = useCallback((sources) => {
    if (Array.isArray(sources)) setSourceViewSources(sources)
    setIsSourcesOpen(true)
  }, [])

  const closeSources = useCallback(() => {
    setIsSourcesOpen(false)
  }, [])

  const selectSource = useCallback((sourceId, sources) => {
    if (Array.isArray(sources)) setSourceViewSources(sources)
    setSelectedSourceId(sourceId)
    setIsSourcesOpen(true)
  }, [])

  const activeSources = useMemo(() => {
    return [...(activeChat?.messages || [])].reverse().find((message) => message.role === 'assistant' && !message.error)?.sources || []
  }, [activeChat])

  return {
    activeChat,
    activeChatId,
    activeSources,
    askingChatId: Boolean(askingChatId && askingChatId === activeChatId),
    browserOnline,
    cancelQuestion,
    chats,
    connectionStatus,
    dismissToast,
    documents,
    isAskingAny: Boolean(askingChatId),
    isSidebarOpen,
    isSourcesOpen,
    isUploadOpen,
    openSources,
    closeSources,
    question,
    retryQuestion,
    selectedSourceId,
    sourceViewSources: sourceViewSources === null ? activeSources : sourceViewSources,
    selectChat,
    selectSource,
    setIsSidebarOpen,
    setIsUploadOpen,
    setQuestion,
    submitQuestion,
    toast,
    uploadFile,
    createNewChat,
    checkConnection,
  }
}

export default useRagWorkspace
