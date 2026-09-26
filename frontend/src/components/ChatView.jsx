import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowUp,
  BookOpenCheck,
  Check,
  ChevronDown,
  CloudOff,
  Copy,
  FileSearch,
  ListChecks,
  Menu,
  MessageCircleQuestion,
  PanelRightOpen,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Square,
  UploadCloud,
  WifiOff,
} from 'lucide-react'

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy is unavailable')
}

const suggestions = [
  {
    icon: ScanSearch,
    title: 'Find key details',
    prompt: 'What are the most important details in my documents?',
  },
  {
    icon: ListChecks,
    title: 'Summarize the content',
    prompt: 'Summarize the key points across all uploaded documents.',
  },
  {
    icon: FileSearch,
    title: 'Compare the documents',
    prompt: 'Compare the uploaded documents and highlight their main differences.',
  },
]

function EmptyState({ disabled, onPrompt }) {
  return (
    <div className="empty-state">
      <div className="empty-orbit" aria-hidden="true">
        <span className="empty-orbit__ring" />
        <span className="empty-orbit__spark"><Sparkles size={23} /></span>
        <i /><i /><i />
      </div>
      <p className="eyebrow">Grounded answers</p>
      <h2>What would you like to know?</h2>
      <p className="empty-state__lead">
        Ask a question and get a clear answer, grounded in the documents you’ve added.
      </p>

      <div className="suggestion-grid" aria-label="Suggested questions">
        {suggestions.map(({ icon: Icon, title, prompt }) => (
          <button key={title} type="button" onClick={() => onPrompt(prompt)} disabled={disabled}>
            <span className="suggestion-grid__icon"><Icon size={18} /></span>
            <span><strong>{title}</strong><small>{prompt}</small></span>
            <ChevronDown size={16} className="suggestion-grid__arrow" />
          </button>
        ))}
      </div>
    </div>
  )
}

function AnswerMessage({ message, isSelected, onSelectSource, onOpenSources, onRetry }) {
  const [copied, setCopied] = useState(false)

  const copyAnswer = async () => {
    try {
      await copyText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className="message message--assistant">
      <div className="message__avatar" aria-hidden="true"><Sparkles size={17} /></div>
      <div className="message__content">
        <div className="message__meta"><strong>Sift</strong><span>Answer grounded in your files</span></div>
        {message.error ? (
          <div className="answer-error" role="alert">
            <strong>We couldn’t complete that answer.</strong>
            <p>{message.content}</p>
            <button type="button" onClick={() => onRetry(message.id)}><RefreshCw size={15} /> Try again</button>
          </div>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {!message.error && (
          <div className="message__footer">
            {message.sources?.length > 0 ? (
              <div className="source-chips" aria-label="Answer sources">
                <span>{message.sources.length} {message.sources.length === 1 ? 'source' : 'sources'}</span>
                {message.sources.slice(0, 3).map((source, index) => (
                  <button
                    key={source.id}
                    className={isSelected === source.id ? 'source-chip--active' : ''}
                    type="button"
                    onClick={() => onSelectSource(source.id, message.sources)}
                    title={source.title}
                  >
                    {index + 1}
                  </button>
                ))}
                <button className="source-chips__all" type="button" onClick={() => onOpenSources(message.sources)}>
                  View all <PanelRightOpen size={14} />
                </button>
              </div>
            ) : (
              <span className="no-source-note">No matching passage found</span>
            )}
            <button className="copy-button" type="button" onClick={copyAnswer} aria-label="Copy answer">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function UserMessage({ message }) {
  return (
    <article className="message message--user">
      <div className="message__avatar" aria-hidden="true">You</div>
      <div className="message__content">
        <div className="message__meta"><strong>You</strong></div>
        <p className="user-message__text">{message.content}</p>
      </div>
    </article>
  )
}

function ThinkingMessage() {
  return (
    <article className="message message--assistant" aria-live="polite" aria-label="Generating an answer">
      <div className="message__avatar" aria-hidden="true"><Sparkles size={17} /></div>
      <div className="message__content">
        <div className="message__meta"><strong>Sift</strong><span>Reading your documents</span></div>
        <div className="thinking">
          <span /><span /><span />
          <p>Finding the most relevant passages</p>
        </div>
      </div>
    </article>
  )
}

function ChatView({
  messages,
  question,
  isAsking,
  isRequestBusy,
  connectionStatus,
  selectedSourceId,
  onQuestionChange,
  onSubmit,
  onCancel,
  onRetry,
  onOpenSidebar,
  onOpenSources,
  onSelectSource,
  onUpload,
  onRetryConnection,
}) {
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const shouldFollowRef = useRef(true)

  useEffect(() => {
    const container = scrollRef.current
    if (!container || !shouldFollowRef.current) return
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [messages, isAsking])

  const handleScroll = () => {
    const container = scrollRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    shouldFollowRef.current = distanceFromBottom < 120
  }

  const resizeTextarea = (element) => {
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }

  const handleInput = (event) => {
    resizeTextarea(event.target)
    onQuestionChange(event.target.value)
  }

  const submitQuestion = () => {
    if (!question.trim() || isAsking) return
    shouldFollowRef.current = true
    onSubmit()
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitQuestion()
    }
  }

  const activeSources = [...messages].reverse().find((message) => message.role === 'assistant' && !message.error)?.sources || []

  return (
    <section className="chat-view" aria-label="Document conversation">
      <header className="topbar">
        <div className="topbar__left">
          <button className="icon-button topbar__menu" type="button" onClick={onOpenSidebar} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <div>
            <p className="topbar__kicker">Workspace</p>
            <h1>Document intelligence</h1>
          </div>
        </div>
        <div className="topbar__actions">
          <span className={`connection-pill connection-pill--${connectionStatus}`}>
            <i /> {connectionStatus === 'online' ? 'Backend ready' : connectionStatus === 'checking' ? 'Checking backend' : connectionStatus === 'offline' ? 'Offline mode' : 'Backend unavailable'}
          </span>
          {messages.length > 0 && (
            <button className="sources-button" type="button" onClick={() => onOpenSources(activeSources)}>
              <BookOpenCheck size={17} /> <span className="sources-button__label">Sources</span>
              {activeSources.length > 0 && <span className="sources-button__count">{activeSources.length}</span>}
            </button>
          )}
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <EmptyState disabled={isAsking} onPrompt={(prompt) => { onQuestionChange(prompt); window.setTimeout(() => textareaRef.current?.focus(), 0) }} />
        ) : (
          <div className="message-list">
            {messages.map((message) => message.role === 'user' ? (
              <UserMessage key={message.id} message={message} />
            ) : (
              <AnswerMessage
                key={message.id}
                message={message}
                isSelected={selectedSourceId}
                onSelectSource={onSelectSource}
                onOpenSources={onOpenSources}
                onRetry={onRetry}
              />
            ))}
            {isAsking && <ThinkingMessage />}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {connectionStatus === 'offline' && (
          <div className="offline-banner" role="status">
            <WifiOff size={16} /> You’re offline. Reconnect to ask new questions.
          </div>
        )}
        {connectionStatus === 'unavailable' && (
          <div className="offline-banner offline-banner--server" role="status">
            <CloudOff size={16} /> The RAG backend can’t be reached.
            <button type="button" onClick={onRetryConnection}><RefreshCw size={13} /> Retry connection</button>
          </div>
        )}
        <div className="composer">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={4000}
            placeholder={messages.length ? 'Ask a follow-up question…' : 'Ask anything about your documents…'}
            aria-label="Question"
            disabled={connectionStatus === 'offline'}
          />
          <div className="composer__actions">
            <button className="composer__upload" type="button" onClick={onUpload} disabled={isAsking} aria-label="Upload another document">
              <UploadCloud size={19} />
            </button>
            <span className="composer__hint">Enter to send · Shift + Enter for new line</span>
            <button
              className={`send-button${isAsking ? ' send-button--stop' : ''}`}
              type="button"
              onClick={isAsking ? onCancel : submitQuestion}
              disabled={(!question.trim() && !isAsking) || (isRequestBusy && !isAsking) || connectionStatus === 'offline' || connectionStatus === 'unavailable'}
              aria-label={isAsking ? 'Cancel answer' : 'Send question'}
            >
              {isAsking ? <Square size={15} fill="currentColor" /> : <ArrowUp size={19} />}
            </button>
          </div>
        </div>
        <p className="composer-disclaimer"><MessageCircleQuestion size={13} /> Sift can make mistakes. Check cited sources for important information.</p>
      </div>
    </section>
  )
}

export default ChatView
