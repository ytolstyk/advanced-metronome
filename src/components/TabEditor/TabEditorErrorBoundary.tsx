import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class TabEditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div
          className="tab-canvas"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: '#e05a5a',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>Something went wrong</div>
          <div
            style={{
              fontSize: '12px',
              color: '#999',
              maxWidth: '420px',
              textAlign: 'center',
              wordBreak: 'break-word',
            }}
          >
            {error.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '4px',
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid #444',
              background: '#1e1e1e',
              color: '#ccc',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
