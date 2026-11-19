import { ResourceStatusProvider } from '@databricks/appkit-ui/react';
import { parseBrandContext } from '@dbx-tools/shared-core';
import { applyBrandContext } from '@dbx-tools/ui/branding';
import { BrandProvider } from '@dbx-tools/ui/branding/react';
import '@dbx-tools/ui/table/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './scanner.css';
import './operations.css';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import brandInput from '../../branding/brand.json';

// Apply tokens, title, and favicon before the first paint; BrandProvider then
// serves the same context to BrandIcon, BrandLogo, and chat exports.
const brand = parseBrandContext(brandInput);
applyBrandContext(brand);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandProvider context={brand}>
      <ErrorBoundary>
        {/*
         * Surfaces resource readiness (e.g. SQL warehouse cold-starts) as a
         * single sonner toast across the whole tree. Both are no-ops when
         * nothing's pending; remove them to render the aggregate yourself
         * via useResourceStatus(). Apps that already mount their own
         * <Toaster /> can swap the indicator for useResourceStatusToaster().
         */}
        <ResourceStatusProvider>
          <App />
        </ResourceStatusProvider>
      </ErrorBoundary>
    </BrandProvider>
  </StrictMode>
);
