import { initRouter, setDeskPath } from "./app/router.js";
import { initPanels } from "./app/panels.js";
import { initScene } from "./app/scene.js";
import { initDeskAlt } from "./app/desk-alt.js";
import "./styles/main.css";

// /home-alt is the papers desk — one open folder of clipped documents in place
// of the five containers — while it is a study beside the live desk. Same
// router, same sheets; only the desk layer differs. docs/desk-papers-plan.md.
const altDesk = window.location.pathname.replace(/\/+$/, "") === "/home-alt";
if (altDesk) setDeskPath("/home-alt");

initRouter();
initPanels();
if (altDesk) initDeskAlt(); else initScene();
