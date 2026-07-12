import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
  widgetName?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class WidgetErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in Widget ${this.props.widgetName || 'Unknown'}:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 text-center w-full min-h-[300px] bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[var(--warning)]" />
          
          <div className="bg-[var(--warning-dim)] border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] p-6 max-w-lg w-full flex flex-col items-center">
            <AlertTriangle className="w-12 h-12 text-[var(--warning)] mb-4" strokeWidth={2.5} />
            <h2 className="text-[18px] font-black text-[#121212] uppercase tracking-wide mb-2">
              {this.props.widgetName ? `${this.props.widgetName} Error` : 'Widget Error'}
            </h2>
            <p className="text-[12px] font-bold text-[#717182] mb-6 font-mono break-all max-h-24 overflow-y-auto bg-white border-2 border-[#121212] p-2 text-left w-full">
              {this.state.error?.message || 'An unexpected error occurred in this module.'}
            </p>
            
            <Button
              onClick={() => this.setState({ hasError: false, error: null })}
              variant="secondary"
              className="w-full justify-center py-3"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
