import { AlertCircle, CheckCircle2, X } from 'lucide-react'

function Toast({ toast, onDismiss }) {
  if (!toast) return null
  const Icon = toast.type === 'error' ? AlertCircle : CheckCircle2

  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      <div className="toast" role={toast.type === 'error' ? 'alert' : 'status'}>
        <Icon size={17} />
        <p>{toast.message}</p>
        <button type="button" onClick={onDismiss} aria-label="Dismiss notification"><X size={16} /></button>
      </div>
    </div>
  )
}

export default Toast
