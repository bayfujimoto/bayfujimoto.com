import { initRouter, setDeskPath } from "./app/router.js";
import { initPanels } from "./app/panels.js";
import { initDeskAlt } from "./app/desk-alt.js";
import { METAL_PATH } from "./app/look.js";
import "./styles/main.css";

// The desk is the papers desk — one open folder of clipped documents, with
// the key, the amber block, the stamp and the clips as the only objects
// (src/app/desk-alt.js; docs/desk-papers-plan.md). The five-container desk
// it replaced is kept on the `original-desk-objects` branch, where it is
// still the default and this one lives at /home-alt.
//
// /home-metal is the same desk under the steel look (src/app/look.js): a
// brushed table and a handheld flashlight. The desk layer keeps that address
// so the look holds through the sheets and back.
if (window.location.pathname.replace(/\/+$/, "") === METAL_PATH) setDeskPath(METAL_PATH);

initRouter();
initPanels();
initDeskAlt();
