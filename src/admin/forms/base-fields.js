// Priority order: record=0, core=1, dates=2, everything else=4, context=5 (last).
// Any group whose id is "dates" or ends with "-dates" is treated as priority 2.
// Context (context note / tags / related ids) sorts to the very bottom, after
// the type-specific groups.
export function orderGroups(groups) {
  const PRIORITY = { record: 0, core: 1, context: 5 };
  const isDates = g => g.id === "dates" || g.id.endsWith("-dates");
  return [...groups].sort((a, b) => {
    const pa = PRIORITY[a.id] ?? (isDates(a) ? 2 : 4);
    const pb = PRIORITY[b.id] ?? (isDates(b) ? 2 : 4);
    if (pa !== pb) return pa - pb;
    return groups.indexOf(a) - groups.indexOf(b);
  });
}

export function getBaseGroups() {
  return [
    {
      id: "record",
      label: "Record",
      fields: [
        { id: "id",     label: "id",     type: "text", readonly: true },
        { id: "slug",   label: "slug",   type: "text", readonly: true },
        { id: "status", label: "status", type: "select", statusColors: true,
          options: ["draft", "partial", "complete", "published"] },
      ],
    },
    {
      id: "core",
      label: "Core",
      fields: [
        { id: "title",        label: "title",        type: "text", required: true },
        { id: "sort_date",    label: "sort date",    type: "date",
          hint: "Pick a date — click to open the calendar" },
        { id: "display_date", label: "display date", type: "text",
          autofillFrom: "sort_date",
          placeholder: "auto from sort date — or override (e.g. Spring 2024)",
          hint: "Use “auto” to derive from sort date, or type an override." },
      ],
    },
    {
      id: "context",
      label: "Context",
      depth: "full",
      fields: [
        { id: "context_note", label: "context note", type: "textarea",
          hint: "Short archival note. Markdown supported." },
        { id: "tags",         label: "tags",         type: "tag-list",
          hint: "Comma-separated" },
        { id: "related_ids",  label: "related ids",  type: "id-list",
          hint: "One ID per line, e.g. EPH-2025-001" },
      ],
    },
  ];
}
