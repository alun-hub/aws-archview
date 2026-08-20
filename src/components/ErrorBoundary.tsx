import { Component, type ErrorInfo, type ReactNode } from 'react'

// Catches errors thrown during render (e.g. a parser hitting an unexpected
// config shape) and surfaces them instead of leaving a blank white page.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AWS ArchView render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#8b2c1e', maxWidth: 760 }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong while rendering this view</h2>
          <pre style={{
            background: '#fdf0ee', border: '1px solid #f0b5ac', borderRadius: 6,
            padding: 12, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12, padding: '6px 12px', cursor: 'pointer',
              border: '1px solid #f0b5ac', background: '#fff', borderRadius: 4,
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
