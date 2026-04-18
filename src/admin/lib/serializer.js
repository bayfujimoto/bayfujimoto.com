import YAML from "js-yaml";

export function toMarkdown(data) {
  const fm = {};
  for (const [k, v] of Object.entries(data)) {
    // Strip admin-private keys
    if (k.startsWith("_")) continue;
    // Strip empty strings, null, undefined
    if (v === null || v === undefined || v === "") continue;
    // Strip empty arrays
    if (Array.isArray(v) && v.length === 0) continue;
    // Strip objects where all values are empty
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const cleaned = Object.fromEntries(
        Object.entries(v).filter(([, val]) => val !== null && val !== undefined && val !== "")
      );
      if (Object.keys(cleaned).length === 0) continue;
      fm[k] = cleaned;
      continue;
    }
    fm[k] = v;
  }

  const yamlStr = YAML.dump(fm, {
    lineWidth: -1,
    quotingType: '"',
    forceQuotes: false,
  });

  return `---\n${yamlStr}---\n`;
}

export function toCountersYAML(counters) {
  return Object.entries(counters)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n") + "\n";
}
