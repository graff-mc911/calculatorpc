import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  children: ReactNode;
  t?: (key: string) => string;
  /** Reset error UI when the route changes (prevents stuck white error card). */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryClass extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    const t = this.props.t || ((key: string) => key);

    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: 'var(--cpc-page, #0f1114)' }}
        >
          <div
            className="max-w-md w-full p-8 text-center"
            style={{
              background: 'var(--cpc-card, #1a1d22)',
              border: '1px solid var(--cpc-line, #2a2f38)',
              borderRadius: 16,
            }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(180,60,60,0.2)' }}
            >
              <AlertTriangle className="h-8 w-8" style={{ color: '#f0a0a0' }} />
            </div>

            <h1
              className="text-2xl font-bold mb-3"
              style={{ color: 'var(--cpc-text, #f2f2f2)' }}
            >
              {t('somethingWentWrong')}
            </h1>

            <p className="mb-4" style={{ color: 'var(--cpc-muted, #9aa3ad)' }}>
              {t('unexpectedErrorMessage')}
            </p>

            {this.state.error?.message && (
              <div
                className="rounded-lg p-3 mb-6 text-left"
                style={{
                  background: 'rgba(180,60,60,0.12)',
                  border: '1px solid rgba(240,160,160,0.25)',
                }}
              >
                <p
                  className="text-xs font-mono break-all"
                  style={{ color: '#f0a0a0' }}
                >
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  this.handleRetry();
                  window.history.back();
                }}
                className="flex-1"
              >
                {t('goBack')}
              </Button>
              <Button onClick={this.handleHome} className="flex-1">
                {t('goToHome')}
              </Button>
            </div>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-3 text-sm bg-transparent border-0 cursor-pointer"
              style={{ color: 'var(--cpc-copper-light, #e0975f)' }}
            >
              Спробувати знову
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const ErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useLanguage();
  const location = useLocation();
  return (
    <ErrorBoundaryClass t={t} resetKey={location.pathname + location.search}>
      {children}
    </ErrorBoundaryClass>
  );
};
