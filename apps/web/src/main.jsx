import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Error {}

function FallbackUI({ error }) {
  return (
    <div style={{ background: '#050D1A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: '#0D1626', border: '1px solid #ef4444', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '100%' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '12px', fontSize: '18px' }}>App Error</h2>
        <pre style={{ color: '#94a3b8', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {error?.message || 'Unknown error'}
        </pre>
        <pre style={{ color: '#64748b', fontSize: '11px', marginTop: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {error?.stack}
        </pre>
      </div>
    </div>
  )
}

import React from 'react'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) return <FallbackUI error={this.state.error} />
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
)
