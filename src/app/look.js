// ── The look — one switch for the desk's light and material ──────────────────
// Two looks, both complete. The wood is the desk at "/"; the steel is the
// desk at "/home-metal" (main.js keeps the desk layer at that address, so
// the look holds through the sheets and back). ?look=wood / ?look=steel on
// either address overrides, for comparing. Rolling the steel back is
// deleting the /home-metal branch of this switch.
//
//   wood   — the desk as built: a warm lamp on a wooden desk.
//   steel  — a brushed stainless table under a handheld flashlight: a cold,
//            dim ambient, a tight beam aimed at the cursor with a slow sway,
//            a dark room to reflect, dust in the beam, a faint flicker, grain
//            over the frame, and a blue-black palette for the layers above.

const DEFAULT_LOOK = "wood";
export const METAL_PATH = "/home-metal";

const params = new URLSearchParams(window.location.search);
const byPath = window.location.pathname.replace(/\/+$/, "") === METAL_PATH ? "steel" : DEFAULT_LOOK;
export const LOOK = params.get("look") === "wood" || params.get("look") === "steel" ? params.get("look") : byPath;

export const LOOKS = {
  wood: {
    palette: null,                              // the tokens as they are
    ambient: { color: 0xffe0b0, intensity: 0.5 },
    spot: { color: 0xffb347, intensity: 120, distance: 20, angle: Math.PI / 5, penumbra: 0.4, decay: 1.5, height: 8 },
    aim: "drift",                               // leans toward the pointer, stays near centre
    environment: null,
    deskMaterial: null,                         // desk.glb's own wood
    catcherOpacity: 0.42,
    overlay: "pool",                            // desk-alt.css: a warm pool, darker edges
    atmosphere: { dust: false, flicker: false, grain: false },
  },
  steel: {
    palette: "steel",                           // [data-look="steel"] in look-steel.css
    ambient: { color: 0x6a7f9c, intensity: 0.42 },
    spot: { color: 0xe4eeff, intensity: 260, distance: 24, angle: Math.PI / 10.5, penumbra: 0.32, decay: 1.4, height: 6.2 },
    aim: "flashlight",                          // at the cursor, handheld
    environment: "darkroom",
    deskMaterial: "brushed-steel",
    catcherOpacity: 0.6,
    overlay: "beam",
    atmosphere: { dust: true, flicker: true, grain: true },
  },
};

export const look = LOOKS[LOOK];
