import { Button } from '@databricks/appkit-ui/react';
import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Present a compact recovery action when an unexpected client error occurs. */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="result-layer">
          <div className="result-card failure">
            <div className="result-icon" aria-hidden="true">
              ×
            </div>
            <h1>Scanner unavailable</h1>
            <p>Reload the app to restart the scanner.</p>
            <Button className="result-button" onClick={() => window.location.reload()}>
              Reload scanner
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
