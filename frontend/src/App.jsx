import { useEffect } from 'react'
import './App.css'
import ChatView from './components/ChatView.jsx'
import Sidebar from './components/Sidebar.jsx'
import SourcePanel from './components/SourcePanel.jsx'
import Toast from './components/Toast.jsx'
import UploadDialog from './components/UploadDialog.jsx'
import useRagWorkspace from './hooks/useRagWorkspace.js'

function App() {
  const workspace = useRagWorkspace()
  const {
    activeChat,
    activeChatId,
    askingChatId,
    cancelQuestion,
    isAskingAny,
    chats,
    checkConnection,
    closeSources,
    connectionStatus,
    createNewChat,
    dismissToast,
    documents,
    isSidebarOpen,
    isSourcesOpen,
    isUploadOpen,
    openSources,
    question,
    retryQuestion,
    selectedSourceId,
    sourceViewSources,
    selectChat,
    selectSource,
    setIsSidebarOpen,
    setIsUploadOpen,
    setQuestion,
    submitQuestion,
    toast,
    uploadFile,
  } = workspace

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return
      if (isUploadOpen) return
      if (isSourcesOpen) closeSources()
      else setIsSidebarOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [closeSources, isSourcesOpen, isUploadOpen, setIsSidebarOpen])

  return (
    <div className="app-shell">
      <Sidebar
        chats={chats}
        documents={documents}
        activeChatId={activeChatId}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onNewChat={createNewChat}
        onSelectChat={selectChat}
        onUpload={() => setIsUploadOpen(true)}
      />

      <ChatView
        messages={activeChat?.messages || []}
        question={question}
        isAsking={askingChatId}
        isRequestBusy={isAskingAny}
        connectionStatus={connectionStatus}
        selectedSourceId={selectedSourceId}
        onQuestionChange={setQuestion}
        onSubmit={submitQuestion}
        onCancel={cancelQuestion}
        onRetry={retryQuestion}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        onOpenSources={openSources}
        onSelectSource={selectSource}
        onUpload={() => setIsUploadOpen(true)}
        onRetryConnection={checkConnection}
      />

      <SourcePanel
        isOpen={isSourcesOpen}
        sources={sourceViewSources}
        selectedSourceId={selectedSourceId}
        onClose={closeSources}
        onSelectSource={selectSource}
      />

      <UploadDialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUpload={uploadFile}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

export default App
