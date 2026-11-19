/**
 * Standalone page for the Info deck. The slides live in the app
 * (packages/app/client/src/info/InfoDeck.tsx) so the Info tab and this page stay identical.
 *
 *   ?slide=N   open slide N (1-based)
 *   ?print     all slides stacked, no motion (PDF)
 *   ?still     one slide, final animation state (PNG)
 */
import { createRoot } from "react-dom/client";
import { InfoDeck } from "../../../packages/app/client/src/info/InfoDeck.tsx";
import "./page.css";

const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(
  <InfoDeck
    mode={params.has("print") ? "print" : params.has("still") ? "slide" : "interactive"}
    initialSlide={Number(params.get("slide") ?? 1) - 1}
    globalKeys
  />,
);
