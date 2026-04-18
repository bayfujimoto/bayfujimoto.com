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

function makeAssetUploadField(field, value, handleChange, getItemId) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-field admin-field--asset-upload";
  if (field.depth === "full") wrapper.dataset.depth = "full";

  const label = document.createElement("label");
  label.textContent = field.label;
  wrapper.appendChild(label);

  const filename = document.createElement("div");
  filename.className = "asset-upload__filename";
  filename.textContent = value || "No file selected";
  wrapper.appendChild(filename);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.id = `field-${field.id.replace(/\./g, "-")}`;
  label.setAttribute("for", fileInput.id);
  wrapper.appendChild(fileInput);

  const status = document.createElement("div");
  status.className = "asset-upload__status";
  wrapper.appendChild(status);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const itemId = getItemId();
    if (!itemId) {
      status.textContent = "Save an ID first before uploading.";
      return;
    }

    status.textContent = "Uploading…";
    fileInput.disabled = true;

    try {
      const { uploadImageAsset } = await import("../lib/upload.js");
      const result = await uploadImageAsset(file, itemId, field.assetRole);

      handleChange(field.id, result.original);
      // Only auto-set thumbnail if this is the primary (first-listed) role
      // and no thumbnail has been set yet
      if (!handleChange._thumbSet) {
        handleChange("assets.thumbnail", result.thumbnail);
        handleChange._thumbSet = true;
      }

      filename.textContent = result.original;
      status.textContent = "Uploaded";
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    } finally {
      fileInput.disabled = false;
    }
  });

  return wrapper;
}

function makeGalleryUploadField(field, initialValue, handleChange, getItemId) {
  // initialValue: array of { file, thumbnail, caption, alt } or undefined
  const gallery = Array.isArray(initialValue) ? initialValue.map(item =>
    typeof item === "string" ? { file: item, thumbnail: "", caption: "", alt: "" } : { ...item }
  ) : [];

  const wrapper = document.createElement("div");
  wrapper.className = "admin-field admin-field--gallery-upload";
  wrapper.dataset.depth = "full";

  const label = document.createElement("label");
  label.textContent = field.label;
  wrapper.appendChild(label);

  const list = document.createElement("div");
  list.className = "gallery-upload__list";
  wrapper.appendChild(list);

  const pickerLabel = document.createElement("label");
  pickerLabel.className = "gallery-upload__add-btn";
  pickerLabel.textContent = gallery.length === 0 ? "Upload images" : "+ Add more images";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  fileInput.style.display = "none";
  pickerLabel.appendChild(fileInput);
  wrapper.appendChild(pickerLabel);

  const status = document.createElement("div");
  status.className = "gallery-upload__status";
  wrapper.appendChild(status);

  function commit() {
    handleChange(field.id, gallery.length > 0 ? gallery.map(item => ({ ...item })) : []);
  }

  function renderList() {
    list.innerHTML = "";
    gallery.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "gallery-upload__row";

      // Reorder buttons
      const reorderDiv = document.createElement("div");
      reorderDiv.className = "gallery-upload__reorder";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.textContent = "▲";
      upBtn.disabled = i === 0;
      upBtn.addEventListener("click", () => {
        if (i === 0) return;
        [gallery[i - 1], gallery[i]] = [gallery[i], gallery[i - 1]];
        renderList();
        commit();
      });

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.textContent = "▼";
      downBtn.disabled = i === gallery.length - 1;
      downBtn.addEventListener("click", () => {
        if (i === gallery.length - 1) return;
        [gallery[i], gallery[i + 1]] = [gallery[i + 1], gallery[i]];
        renderList();
        commit();
      });

      reorderDiv.appendChild(upBtn);
      reorderDiv.appendChild(downBtn);
      row.appendChild(reorderDiv);

      // Thumbnail preview
      if (item.thumbnail) {
        const { imageUrl } = window.__imageUrl || {};
        const thumb = document.createElement("img");
        thumb.className = "gallery-upload__thumb";
        thumb.alt = item.alt || item.file;
        const base = (typeof VITE_R2_BASE_URL !== "undefined" ? VITE_R2_BASE_URL : "")
          || document.querySelector("meta[name=r2-base]")?.content || "";
        thumb.src = base ? `${base}/thumbnails/${item.thumbnail}` : item.thumbnail;
        row.appendChild(thumb);
      }

      // Info block
      const info = document.createElement("div");
      info.className = "gallery-upload__info";

      const fileLabel = document.createElement("div");
      fileLabel.className = "gallery-upload__filename";
      fileLabel.textContent = item.file;
      info.appendChild(fileLabel);

      const captionInput = document.createElement("input");
      captionInput.type = "text";
      captionInput.placeholder = "caption";
      captionInput.value = item.caption || "";
      captionInput.addEventListener("input", () => {
        gallery[i].caption = captionInput.value;
        commit();
      });

      const altInput = document.createElement("input");
      altInput.type = "text";
      altInput.placeholder = "alt text";
      altInput.value = item.alt || "";
      altInput.addEventListener("input", () => {
        gallery[i].alt = altInput.value;
        commit();
      });

      info.appendChild(captionInput);
      info.appendChild(altInput);
      row.appendChild(info);

      // Remove button
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "gallery-upload__remove";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        gallery.splice(i, 1);
        renderList();
        commit();
        pickerLabel.textContent = gallery.length === 0 ? "Upload images" : "+ Add more images";
      });
      row.appendChild(removeBtn);

      list.appendChild(row);
    });
  }

  renderList();

  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;

    const itemId = getItemId();
    if (!itemId) {
      status.textContent = "Save an ID first before uploading.";
      return;
    }

    fileInput.disabled = true;
    status.textContent = `Uploading 0 / ${files.length}…`;

    try {
      const { uploadGalleryAsset } = await import("../lib/upload.js");
      let startIndex = gallery.length;
      for (let i = 0; i < files.length; i++) {
        status.textContent = `Uploading ${i + 1} / ${files.length}…`;
        const result = await uploadGalleryAsset(files[i], itemId, startIndex + i);
        gallery.push(result);

        // Auto-set thumbnail from first gallery image if nothing has set it yet
        if (!handleChange._thumbSet) {
          handleChange("assets.thumbnail", result.thumbnail);
          handleChange._thumbSet = true;
        }
      }
      renderList();
      commit();
      pickerLabel.textContent = "+ Add more images";
      status.textContent = `${files.length} image${files.length > 1 ? "s" : ""} uploaded`;
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    } finally {
      fileInput.disabled = false;
      fileInput.value = "";
    }
  });

  return wrapper;
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

  function getItemId() {
    return currentData.id || "";
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

    // Reset per-fieldset thumbnail tracking so only the first upload role sets the thumb
    handleChange._thumbSet = false;

    for (const field of group.fields) {
      if (field.depth === "full" && depth === "quick") continue;
      // In quick mode, hide all asset upload fields
      if (depth === "quick" && field.id.startsWith("assets.")) continue;

      const value = getNestedValue(currentData, field.id);
      let el;
      if (field.type === "asset-upload") {
        el = makeAssetUploadField(field, value, handleChange, getItemId);
      } else if (field.type === "gallery-upload") {
        el = makeGalleryUploadField(field, value, handleChange, getItemId);
      } else {
        el = makeField(field, value, handleChange);
      }
      fieldset.appendChild(el);
    }

    // Only append fieldset if it has visible inputs or gallery fields
    if (fieldset.querySelector("input, select, textarea, .admin-field--gallery-upload")) {
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
