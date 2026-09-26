import { useEffect, useId, useRef, useState } from 'react'
import { FileText, LoaderCircle, UploadCloud, X } from 'lucide-react'

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024

function getFileError(file, maxBytes) {
  if (!file) return 'Choose a file to continue.'
  if (!file.name.toLowerCase().endsWith('.pdf')) return 'Only PDF documents are supported.'
  if (file.type && !['application/pdf', 'application/octet-stream', 'application/x-pdf'].includes(file.type)) {
    return 'This file does not appear to be a PDF.'
  }
  if (file.size === 0) return 'This file is empty and cannot be indexed.'
  if (file.size > maxBytes) {
    return `This file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`
  }
  return null
}

function UploadDialog({ isOpen, onClose, onUpload, maxBytes = DEFAULT_MAX_BYTES, accept }) {
  const titleId = useId()
  const descriptionId = useId()
  const inputId = useId()
  const fileInputRef = useRef(null)
  const dialogRef = useRef(null)
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting) onClose()
      if (event.key !== 'Tab') return

      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || [])]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.classList.add('modal-open')
    window.setTimeout(() => fileInputRef.current?.focus(), 0)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('modal-open')
    }
  }, [isOpen, isSubmitting, onClose])

  if (!isOpen) return null

  const selectFile = (nextFile) => {
    const error = getFileError(nextFile, maxBytes)
    setFileError(error || '')
    setSubmitError('')
    setFile(error ? null : nextFile)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const error = getFileError(file, maxBytes)
    if (error) {
      setFileError(error)
      return
    }

    setIsSubmitting(true)
    setSubmitError('')
    try {
      await onUpload(file)
      onClose()
    } catch (uploadError) {
      setSubmitError(uploadError?.message || 'The document could not be uploaded. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !isSubmitting && onClose()}>
      <section
        ref={dialogRef}
        className="upload-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Add knowledge</p>
            <h2 id={titleId}>Upload a document</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={isSubmitting} aria-label="Close upload dialog">
            <X size={19} />
          </button>
        </div>

        <p id={descriptionId} className="dialog-description">
          Add a file to your private workspace. You can ask questions across every document you upload.
        </p>

        <form onSubmit={handleSubmit}>
          <label
            className={`drop-zone${isDragging ? ' drop-zone--active' : ''}${file ? ' drop-zone--selected' : ''}`}
            htmlFor={inputId}
            onDragEnter={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault()
              if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              selectFile(event.dataTransfer.files?.[0])
            }}
          >
            <input
              ref={fileInputRef}
              id={inputId}
              type="file"
              accept={accept || '.pdf,application/pdf'}
              disabled={isSubmitting}
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <span className="drop-zone__icon" aria-hidden="true">
              {file ? <FileText size={27} /> : <UploadCloud size={27} />}
            </span>
            {file ? (
              <>
                <strong>{file.name}</strong>
                <span>{(file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB · Ready to index</span>
                <span className="drop-zone__change">Choose a different file</span>
              </>
            ) : (
              <>
                <strong>Drop your document here</strong>
                <span>or click to browse your files</span>
                <span className="drop-zone__hint">PDF documents · up to 25 MB</span>
              </>
            )}
          </label>

          {fileError && <p className="field-error" role="alert">{fileError}</p>}
          {submitError && <div className="inline-alert inline-alert--error" role="alert">{submitError}</div>}

          <div className="privacy-note">
            <span className="privacy-note__dot" aria-hidden="true" />
            Files are sent only to your configured RAG backend for processing.
          </div>

          <div className="dialog-actions">
            <button className="button button--quiet" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button className="button button--primary" type="submit" disabled={!file || isSubmitting}>
              {isSubmitting ? <LoaderCircle className="spin" size={17} /> : <UploadCloud size={17} />}
              {isSubmitting ? 'Indexing document…' : 'Add document'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default UploadDialog
