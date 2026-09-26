import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('The workspace encountered an unexpected error:', error, info)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="fatal-error" role="alert">
        <div className="fatal-error__card">
          <span className="fatal-error__icon" aria-hidden="true">
            <AlertTriangle size={26} />
          </span>
          <p className="eyebrow">Something went wrong</p>
          <h1>The workspace needs a quick reset.</h1>
          <p>
            Your uploaded documents and conversation are kept in this browser. Reload
            the app to continue without clearing your local workspace.
          </p>
          <button className="button button--primary" type="button" onClick={() => window.location.reload()}>
            <RefreshCw size={17} />
            Reload workspace
          </button>
        </div>
      </main>
    )
  }
}

export default ErrorBoundary
