# Vision Flow deck

Six-slide story: the lottery receipt audit, the follow-up questions (ID cards, signed documents), AI generating the structure as well as reading images, the prompt-to-pipeline flow, and what runs on Databricks.

- Present: open `index.html` in a browser. Arrow keys, Page Up/Down, Home/End, or the on-screen buttons. `?slide=N` opens a specific slide.
- Share: `vision-flow.pdf` (16:9) or `slides/NN.png` (1920×1080).
- Rebuild the PDF and PNGs after editing: `bun docs/research/deck/build.ts` (needs Google Chrome).

Colors, type, and the viewfinder motif follow [`docs/branding`](../../branding/README.md). Schema fields and the prompt on slide 5 come from the `lottery_receipt` demo schema in `packages/app/server/demo-schemas.ts`; the dashboard counts and row values are illustrative.
