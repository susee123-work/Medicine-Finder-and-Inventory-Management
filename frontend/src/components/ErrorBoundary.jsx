import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 32,
          margin: 24,
          background: 'var(--critical-bg)',
          border: '1px solid var(--critical)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--critical)'
        }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>An unexpected interface error occurred</h2>
          <p style={{ fontSize: 14, marginBottom: 16 }}>{this.state.error?.message || 'Unknown error'}</p>
          <button
            className="btn btn-secondary"
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
          >
            Reload Screen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
