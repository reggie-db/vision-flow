# Vision Flow deck

Five slides: the daily lottery receipt audit, the follow-up request (ID cards, signed documents), the two uses of AI in the demo, an animated prompt-to-data flow, and the Databricks components.

The slides are React components in the app, at `packages/app/client/src/info/` (`InfoDeck.tsx`, `FlowDiagram.tsx`, `info-deck.css`). The app's Info tab renders them directly, and this folder bundles the same components into a standalone page, so the two stay identical. Edit the slides there, not here.

- Present: open `index.html` in a browser. Arrow keys, Page Up/Down, Home/End, or the on-screen controls. `?slide=N` opens a specific slide.
- Share: `vision-flow.pdf` (16:9) or `slides/NN.png` (1920×1080). Both show the flow slide in its final state.
- Rebuild `dist/`, the PNGs, and the PDF after editing: `bun docs/research/deck/build.ts` (needs Google Chrome).

Slide 4 uses React Flow (`@xyflow/react`). Navy edges are generated once by AI (schema, dashboard page, Genie context, extraction instructions); Lava edges carry data continuously, with receipts moving along them. The reveal replays each time the slide is shown, and reduced-motion users get the final state.

Colors and type follow [`docs/branding`](../../branding/README.md). The prompt and fields come from the `lottery_receipt` demo schema in `packages/app/server/demo-schemas.ts`; the dashboard counts, Genie answer, and row values are illustrative.
