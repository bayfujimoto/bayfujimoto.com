function getNestedValue(obj, dotPath) {
  return dotPath.split(".").reduce((acc, key) => acc?.[key], obj);
}

function setNestedValue(obj, dotPath, value) {
  const keys = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function parseTagList(str) {
  return str.split(",").map(s => s.trim()).filter(Boolean);
}

function parseIdList(str) {
  return str.split("\n").map(s => s.trim()).filter(Boolean);
}

function parsePairList(str) {
  return str.split("\n").map(line => {
    const idx = line.indexOf(":");
    if (idx === -1) return null;
    return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
  }).filter(Boolean);
}

function serializeTagList(arr) {
  return Array.isArray(arr) ? arr.join(", ") : (arr || "");
}

function serializeIdList(arr) {
  return Array.isArray(arr) ? arr.join("\n") : (arr || "");
}

function serializePairList(arr) {
  if (!Array.isArray(arr)) return arr || "";
  return arr.map(item => {
    if (typeof item === "object" && item !== null) {
      const key = Object.keys(item)[0] || "label";
      return `${item[key] ?? item.label}: ${item.value ?? Object.values(item)[1] ?? ""}`;
    }
    return String(item);
  }).join("\n");
}

function makeField(field, value, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-field";
  if (field.depth === "full") wrapper.dataset.depth = "full";

  const label = document.createElement("label");
  label.textContent = field.label;
  if (field.required) label.textContent += " *";
  wrapper.appendChild(label);

  let input;

  if (field.type === "select") {
    input = document.createElement("select");
    for (const opt of field.options || []) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      input.appendChild(o);
    }
    input.value = value ?? field.options?.[0] ?? "";
    input.addEventListener("change", () => onChange(field.id, input.value));

  } else if (field.type === "textarea") {
    input = document.createElement("textarea");
    input.value = value ?? "";
    input.addEventListener("input", () => onChange(field.id, input.value));

  } else if (field.type === "tag-list") {
    input = document.createElement("input");
    input.type = "text";
    input.value = serializeTagList(value);
    input.placeholder = field.placeholder || "tag1, tag2, tag3";
    input.addEventListener("input", () => onChange(field.id, parseTagList(input.value)));

  } else if (field.type === "id-list" || field.id === "roles") {
    input = document.createElement("textarea");
    input.value = serializeIdList(value);
    input.placeholder = field.placeholder || "One per line";
    input.style.minHeight = "60px";
    input.addEventListener("input", () => onChange(field.id, parseIdList(input.value)));

  } else if (field.type === "pair-list") {
    input = document.createElement("textarea");
    input.value = serializePairList(value);
    input.placeholder = field.placeholder || "label: value\nlabel: value";
    input.style.minHeight = "60px";
    input.addEventListener("input", () => onChange(field.id, parsePairList(input.value)));

  } else {
    // text, date, number
    input = document.createElement("input");
    input.type = field.type === "date" ? "date" : "text";
    input.value = value ?? "";
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.readonly) { input.readOnly = true; input.setAttribute("readonly", ""); }
    input.addEventListener("input", () => onChange(field.id, input.value));
  }

  input.id = `field-${field.id.replace(/\./g, "-")}`;
  label.setAttribute("for", input.id);
  if (field.required) input.required = true;
  wrapper.appendChild(input);

  if (field.hint) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = field.hint;
    wrapper.appendChild(hint);
  }

  return wrapper;
}

export function renderForm(container, groups, initialData, onChange, depth = "full") {
  const form = document.createElement("div");
  form.className = "admin-form";

  const currentData = JSON.parse(JSON.stringify(initialData || {}));

  function handleChange(fieldId, value) {
    setNestedValue(currentData, fieldId, value);
    onChange?.(fieldId, value, currentData);
  }

  for (const group of groups) {
    if (group.depth === "full" && depth === "quick") continue;

    const fieldset = document.createElement("div");
    fieldset.className = "admin-fieldset";
    fieldset.dataset.group = group.id;

    const legend = document.createElement("div");
    legend.className = "admin-fieldset-legend";
    legend.textContent = group.label;
    fieldset.appendChild(legend);

    for (const field of group.fields) {
      if (field.depth === "full" && depth === "quick") continue;
      // In quick mode, hide all asset fields except thumbnail
      if (depth === "quick" && field.id.startsWith("assets.") && field.id !== "assets.thumbnail") continue;

      const value = getNestedValue(currentData, field.id);
      const el = makeField(field, value, handleChange);
      fieldset.appendChild(el);
    }

    // Only append fieldset if it has visible inputs
    if (fieldset.querySelector("input, select, textarea")) {
      form.appendChild(fieldset);
    }
  }

  container.appendChild(form);

  return {
    getData() {
      return JSON.parse(JSON.stringify(currentData));
    },
    setField(fieldId, value) {
      setNestedValue(currentData, fieldId, value);
      const el = form.querySelector(`#field-${fieldId.replace(/\./g, "-")}`);
      if (el) el.value = value ?? "";
    },
  };
}
