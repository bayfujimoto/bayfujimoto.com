import { initRouter } from "./app/router.js";
import { initPanels } from "./app/panels.js";
import { initDesk } from "./app/desk-scene.js";
import "./styles/main.css";

// The desk is the papers desk in the scene — one open folder of clipped
// documents on the wooden desk, with the key, the amber block, the stamp and
// the clips as the only objects; two lights, the lamp and the flashlight,
// switched with Space (src/app/desk-scene.js; docs/desk-papers-plan.md). The
// five-container desk it replaced is kept on the `original-desk-objects`
// branch; /home-alt and /home-metal, its earlier addresses, resolve to "/".
initRouter();
initPanels();
initDesk();
