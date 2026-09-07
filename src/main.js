import { initRouter, setDeskPath } from "./app/router.js";
import { initPanels } from "./app/panels.js";
import { initDeskAlt } from "./app/desk-alt.js";
import { initDeskMetal } from "./app/desk-metal.js";
import { METAL_PATH } from "./app/look.js";
import "./styles/main.css";

// The desk is the papers desk — one open folder of clipped documents, with
// the key, the amber block, the stamp and the clips as the only objects
// (src/app/desk-alt.js; docs/desk-papers-plan.md). The five-container desk
// it replaced is kept on the `original-desk-objects` branch, where it is
// still the default and this one lives at /home-alt.
//
// /home-metal is the desk rebuilt in the scene (src/app/desk-metal.js): every
// paper a textured plane on a real PBR table under a handheld flashlight.
// The desk layer keeps that address so the look holds through the sheets
// and back.
const metal = window.location.pathname.replace(/\/+$/, "") === METAL_PATH;
if (metal) setDeskPath(METAL_PATH);

initRouter();
initPanels();
if (metal) initDeskMetal(); else initDeskAlt();
