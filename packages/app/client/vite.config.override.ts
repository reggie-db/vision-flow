import { tunnelAllowedHosts } from '@dbx-tools/tunnel';
import { defineConfig } from 'vite';

/** Permit only the tunnel hosts already owned by the authentication gate config. */
export default defineConfig({
  server: {
    allowedHosts: tunnelAllowedHosts(),
  },
});
