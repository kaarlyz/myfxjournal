import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
          <div className="bg-[rgba(246,70,93,0.08)] p-6 rounded-xl border border-[rgba(246,70,93,0.2)] max-w-lg w-full">
            <AlertTriangle className="w-12 h-12 text-[#f6465d] mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-sm text-[#929aa5] mb-6">
              {this.state.error?.message || 'An unexpected error occurred in this module.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center space-x-2 bg-lossRed text-white px-4 py-2 rounded-lg font-bold hover:bg-lossRed/80 transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Page</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
