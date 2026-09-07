import { initRouter } from "./app/router.js";
import { initPanels } from "./app/panels.js";
import { initDeskAlt } from "./app/desk-alt.js";
import "./styles/main.css";

// The desk is the papers desk — one open folder of clipped documents, with
// the key, the amber block, the stamp and the clips as the only objects
// (src/app/desk-alt.js; docs/desk-papers-plan.md). The five-container desk
// it replaced is kept on the `original-desk-objects` branch, where it is
// still the default and this one lives at /home-alt.
initRouter();
initPanels();
initDeskAlt();
