export function initRouter(routes) {
  function route() {
    const hash = location.hash.slice(1) || "/";
    const match = Object.entries(routes).find(([pattern]) => hash.startsWith(pattern));
    if (match) match[1](hash);
  }
  window.addEventListener("hashchange", route);
  route();
}
