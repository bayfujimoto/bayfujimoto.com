// Loading screen — the dark threshold shown while the desk and its objects
// load. scene.js calls dismissLoadingScreen() once THREE.LoadingManager reports
// every model decoded; the overlay then holds briefly (so it never flashes on a
// cached load), fades out, and removes itself. A safety timeout guarantees the
// visitor is never stranded on the threshold if WebGL is unavailable or a model
// fails to arrive.

const MIN_VISIBLE_MS = 900;   // hold long enough to read, even when models are cached
const FADE_MS = 800;          // must match the .loading-screen transition in main.css
const SAFETY_MS = 10000;      // last-resort dismissal if onLoad never fires

const startTime = performance.now();
let dismissed = false;

export function dismissLoadingScreen() {
  if (dismissed) return;
  dismissed = true;

  const el = document.getElementById("loading-screen");
  if (!el) return;

  const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - startTime));
  setTimeout(() => {
    el.classList.add("loading-screen--out");
    const remove = () => el.remove();
    el.addEventListener("transitionend", remove, { once: true });
    // Fallback: reduced-motion / interrupted transitions may not fire transitionend.
    setTimeout(remove, FADE_MS + 100);
  }, wait);
}

// Never let a failed or absent load trap the visitor behind the overlay.
setTimeout(dismissLoadingScreen, SAFETY_MS);
