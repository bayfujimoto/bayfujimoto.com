// Constellations that live inside a series instead of at /constellations/<slug>/.
// The biography is one: a constellation of memorable items whose home address
// is the identity dossier's biography subcollection. Membership and note still
// come from the registry (src/content/constellations/biography.md); only the
// address, breadcrumb, and reach differ — /constellations/biography/ redirects
// there, and member cards do not print it in their constellations rider row.
// Shared by the site (router/panels) and the admin (explorer/editor).
export const CONSTELLATION_HOMES = {
  biography: { series: "identity", subcollection: "biography" },
};

// The registry slug a series/subcollection address stands for, or null.
export function homedConstellationSlug(series, subcollection) {
  for (const [slug, home] of Object.entries(CONSTELLATION_HOMES)) {
    if (home.series === series && home.subcollection === subcollection) return slug;
  }
  return null;
}
