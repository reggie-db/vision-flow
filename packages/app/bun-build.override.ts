import { resolve } from 'node:path';
import type { BunPlugin } from 'bun';

const clientSource: BunPlugin = {
  name: 'client-source',
  setup(build) {
    build.onResolve({ filter: /^\/src\// }, ({ path }) => ({
      path: resolve(import.meta.dirname, 'client', path.slice(1)),
    }));
  },
};

/** Resolve Vite-style source URLs while Bun bundles the production HTML entrypoint. */
export default {
  external: ["/favicon.svg", "/fonts/*", "/site.webmanifest"],
  plugins: [clientSource],
};
