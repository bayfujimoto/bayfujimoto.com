export function getBaseGroups() {
  return [
    {
      id: "record",
      label: "Record",
      fields: [
        { id: "id",     label: "id",     type: "text", readonly: true },
        { id: "slug",   label: "slug",   type: "text", readonly: true },
        { id: "status", label: "status", type: "select",
          options: ["draft", "partial", "complete", "published"] },
      ],
    },
    {
      id: "core",
      label: "Core",
      fields: [
        { id: "title",        label: "title",        type: "text", required: true },
        { id: "display_date", label: "display date", type: "text",
          placeholder: "e.g. March 12, 2025" },
        { id: "sort_date",    label: "sort date",    type: "date",
          hint: "YYYY-MM-DD, used for sorting" },
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
