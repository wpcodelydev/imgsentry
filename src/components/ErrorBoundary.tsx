import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, LayoutDashboard, Bug, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  children: ReactNode;
  componentName?: string;
  onReset?: () => void;
  isTopLevel?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    // Log full detail to the browser console for developer debugging
    console.error('ErrorBoundary caught:', error, errorInfo);
    console.error(
      `[ImgSentry] Unhandled error caught in boundary (${this.props.componentName || 'App'}):`,
      error,
      errorInfo
    );
  }

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      const { componentName, isTopLevel } = this.props;
      const { error, errorInfo, showDetails } = this.state;

      return (
        <div className={`p-6 my-4 bg-white dark:bg-[#111827] border border-rose-200 dark:border-rose-900/50 rounded-2xl shadow-sm ${isTopLevel ? 'max-w-4xl mx-auto my-8' : 'w-full'}`}>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/50 rounded-xl text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="flex-1 space-y-3 min-w-0">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {componentName ? `Something went wrong in ${componentName}` : 'Something went wrong loading this page'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  An unexpected error occurred while rendering this section. You can try reloading the section, or switch to another tab in the plugin.
                </p>
              </div>

              {/* Error summary badge */}
              {error && (
                <div className="p-3 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/40 rounded-lg text-xs font-mono text-rose-700 dark:text-rose-300 break-words">
                  <strong>Error:</strong> {error.message || error.toString()}
                </div>
              )}

              {/* Collapsible Debug / Stack Details */}
              <div className="pt-1">
                <button
                  onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <Bug className="w-3.5 h-3.5" />
                  <span>{showDetails ? 'Hide Technical Details' : 'Show Technical Details'}</span>
                  {showDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>

                {showDetails && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] font-semibold text-gray-500 dark:text-slate-400">
                      Error Stack & Component Trace:
                    </div>
                    <pre className="text-[11px] bg-slate-900 text-rose-300 p-3.5 rounded-xl font-mono overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap border border-slate-800">
                      {error?.stack || 'No stack trace available.'}
                      {errorInfo?.componentStack && (
                        <>
                          {'\n\nComponent Stack:'}
                          {errorInfo.componentStack}
                        </>
                      )}
                    </pre>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <button
                  onClick={this.handleRetry}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>

                <button
                  onClick={this.handleReload}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-gray-200 dark:border-slate-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reload Page</span>
                </button>

                {this.props.onReset && !isTopLevel && (
                  <button
                    onClick={this.handleReset}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 ml-auto"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    <span>Go to Dashboard</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
