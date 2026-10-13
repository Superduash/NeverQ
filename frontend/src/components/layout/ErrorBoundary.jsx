import React, { Component } from 'react';
import { Button } from '../ui/index.js';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('NeverQ Uncaught Application Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center min-h-[50vh] bg-[var(--bg)] text-[var(--ink)]">
          <div className="w-14 h-14 rounded-2xl bg-[var(--danger)]/15 text-[var(--danger)] flex items-center justify-center mb-3.5">
            <AlertTriangle size={28} />
          </div>
          <h2 className="font-heading font-extrabold text-lg text-[var(--ink)] mb-1">
            Application Error
          </h2>
          <p className="text-xs text-[var(--ink-faint)] max-w-sm mb-4 leading-relaxed">
            NeverQ encountered an unexpected problem. We recommend reloading the page.
          </p>
          <Button
            variant="primary"
            iconLeft={<RefreshCw size={14} />}
            onClick={this.handleReset}
          >
            Reload Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
