import { Database, FileText, MessageSquareText, Plus, ScanText, Upload, X } from 'lucide-react'

function toIsoString(timestamp) {
  const date = new Date(timestamp || Date.now())
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function formatChatTime(timestamp) {
  if (!timestamp) return 'Just now'

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Just now'
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()

  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function Sidebar({
  chats,
  documents,
  activeChatId,
  isOpen,
  onClose,
  onNewChat,
  onSelectChat,
  onUpload,
}) {
  return (
    <>
      <button
        type="button"
        className={`sidebar-scrim${isOpen ? ' sidebar-scrim--visible' : ''}`}
        onClick={onClose}
        aria-label="Close navigation"
        tabIndex={isOpen ? 0 : -1}
      />
      <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`} aria-label="Workspace navigation">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true"><ScanText size={21} strokeWidth={2.2} /></div>
          <div className="brand-name">Sift<span>.</span></div>
          <button className="icon-button sidebar__close" type="button" onClick={onClose} aria-label="Close navigation">
            <X size={19} />
          </button>
        </div>

        <button className="new-chat-button" type="button" onClick={onNewChat}>
          <Plus size={18} />
          New conversation
          <kbd>⌘ K</kbd>
        </button>

        <div className="sidebar__scroll">
          <section className="sidebar-section" aria-labelledby="conversation-heading">
            <div className="sidebar-section__heading">
              <span id="conversation-heading">Conversations</span>
              {chats.length > 0 && <span>{chats.length}</span>}
            </div>
            <div className="conversation-list">
              {chats.length === 0 ? (
                <p className="sidebar-empty">Your conversations will appear here.</p>
              ) : (
                chats.map((chat) => (
                  <button
                    key={chat.id}
                    className={`conversation-item${activeChatId === chat.id ? ' conversation-item--active' : ''}`}
                    type="button"
                    onClick={() => onSelectChat(chat.id)}
                    aria-current={activeChatId === chat.id ? 'page' : undefined}
                  >
                    <MessageSquareText size={16} />
                    <span>{chat.title || 'Untitled conversation'}</span>
                    <time dateTime={toIsoString(chat.updatedAt)}>{formatChatTime(chat.updatedAt)}</time>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="sidebar-section" aria-labelledby="knowledge-heading">
            <div className="sidebar-section__heading">
              <span id="knowledge-heading">Knowledge base</span>
              <span>{documents.length}</span>
            </div>
            <div className="document-list">
              {documents.length === 0 ? (
                <div className="knowledge-empty">
                  <Database size={20} />
                  <p>No documents yet</p>
                </div>
              ) : (
                documents.slice(0, 6).map((document) => (
                  <div className="document-item" key={document.id} title={document.name}>
                    <span className="document-item__icon"><FileText size={15} /></span>
                    <span>{document.name}</span>
                  </div>
                ))
              )}
              {documents.length > 6 && <p className="document-overflow">+ {documents.length - 6} more documents</p>}
            </div>
          </section>
        </div>

        <div className="sidebar__footer">
          <button className="upload-button" type="button" onClick={onUpload}>
            <span className="upload-button__icon"><Upload size={18} /></span>
            <span><strong>Add a document</strong><small>Expand your knowledge base</small></span>
          </button>
          <p className="local-note"><span /> Saved in this browser</p>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
