import { INSPECTION_ASSETS_SENTINEL } from "./type-fields.js";

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

// Shared ordered-image-list uploader used by gallery and document modes
function makeOrderedImageField(opts) {
  // opts: { fieldId, fieldLabel, uploadFn, handleChange, getItemId, initialValue }
  const { fieldId, fieldLabel, uploadFn, handleChange, getItemId, initialValue } = opts;

  const items = Array.isArray(initialValue) ? initialValue.map(item =>
    typeof item === "string" ? { file: item, thumbnail: "", caption: "", alt: "" } : { ...item }
  ) : [];

  const wrapper = document.createElement("div");
  wrapper.className = "admin-field admin-field--gallery-upload";
  wrapper.dataset.depth = "full";

  const label = document.createElement("label");
  label.textContent = fieldLabel;
  wrapper.appendChild(label);

  const list = document.createElement("div");
  list.className = "gallery-upload__list";
  wrapper.appendChild(list);

  const pickerLabel = document.createElement("label");
  pickerLabel.className = "gallery-upload__add-btn";
  pickerLabel.textContent = items.length === 0 ? "Upload images" : "+ Add more images";

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
    handleChange(fieldId, items.length > 0 ? items.map(item => ({ ...item })) : []);
  }

  function renderList() {
    list.innerHTML = "";
    items.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "gallery-upload__row";

      const reorderDiv = document.createElement("div");
      reorderDiv.className = "gallery-upload__reorder";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.textContent = "▲";
      upBtn.disabled = i === 0;
      upBtn.addEventListener("click", () => {
        if (i === 0) return;
        [items[i - 1], items[i]] = [items[i], items[i - 1]];
        renderList();
        commit();
      });

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.textContent = "▼";
      downBtn.disabled = i === items.length - 1;
      downBtn.addEventListener("click", () => {
        if (i === items.length - 1) return;
        [items[i], items[i + 1]] = [items[i + 1], items[i]];
        renderList();
        commit();
      });

      reorderDiv.appendChild(upBtn);
      reorderDiv.appendChild(downBtn);
      row.appendChild(reorderDiv);

      if (item.thumbnail) {
        const base = document.querySelector("meta[name=r2-base]")?.content || "";
        const thumb = document.createElement("img");
        thumb.className = "gallery-upload__thumb";
        thumb.alt = item.alt || item.file;
        thumb.src = base ? `${base}/thumbnails/${item.thumbnail}` : item.thumbnail;
        row.appendChild(thumb);
      }

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
      captionInput.addEventListener("input", () => { items[i].caption = captionInput.value; commit(); });

      const altInput = document.createElement("input");
      altInput.type = "text";
      altInput.placeholder = "alt text";
      altInput.value = item.alt || "";
      altInput.addEventListener("input", () => { items[i].alt = altInput.value; commit(); });

      info.appendChild(captionInput);
      info.appendChild(altInput);
      row.appendChild(info);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "gallery-upload__remove";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        items.splice(i, 1);
        renderList();
        commit();
        pickerLabel.textContent = items.length === 0 ? "Upload images" : "+ Add more images";
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
    if (!itemId) { status.textContent = "Save an ID first before uploading."; return; }

    fileInput.disabled = true;
    status.textContent = `Uploading 0 / ${files.length}…`;

    try {
      const startIndex = items.length;
      for (let i = 0; i < files.length; i++) {
        status.textContent = `Uploading ${i + 1} / ${files.length}…`;
        const result = await uploadFn(files[i], itemId, startIndex + i);
        items.push(result);

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

function makeGalleryUploadField(field, initialValue, handleChange, getItemId) {
  return makeOrderedImageField({
    fieldId: field.id,
    fieldLabel: field.label,
    uploadFn: async (file, itemId, index) => {
      const { uploadGalleryAsset } = await import("../lib/upload.js");
      return uploadGalleryAsset(file, itemId, index);
    },
    handleChange,
    getItemId,
    initialValue,
  });
}

// Renders the correct asset upload UI for the chosen inspection mode
function makeInspectionAwareAssets(mode, currentData, handleChange, getItemId) {
  const container = document.createElement("div");
  container.className = "inspection-assets";

  if (!mode || mode === "none") {
    return container;
  }

  if (mode === "card") {
    // front (required) + back (optional)
    const frontField = { id: "assets.front", label: "front", type: "asset-upload", assetRole: "front" };
    const backField  = { id: "assets.back",  label: "back (optional)", type: "asset-upload", assetRole: "back" };
    handleChange._thumbSet = !!currentData.assets?.thumbnail;
    container.appendChild(makeAssetUploadField(frontField, currentData.assets?.front, handleChange, getItemId));
    container.appendChild(makeAssetUploadField(backField,  currentData.assets?.back,  handleChange, getItemId));
    return container;
  }

  if (mode === "gallery") {
    const field = { id: "assets.gallery", label: "gallery images" };
    handleChange._thumbSet = !!currentData.assets?.thumbnail;
    container.appendChild(makeGalleryUploadField(field, currentData.assets?.gallery, handleChange, getItemId));
    return container;
  }

  if (mode === "document") {
    handleChange._thumbSet = !!currentData.assets?.thumbnail;
    container.appendChild(makeOrderedImageField({
      fieldId: "assets.pages",
      fieldLabel: "pages",
      uploadFn: async (file, itemId, index) => {
        const { uploadDocumentPage } = await import("../lib/upload.js");
        return uploadDocumentPage(file, itemId, index);
      },
      handleChange,
      getItemId,
      initialValue: currentData.assets?.pages,
    }));
    return container;
  }

  if (mode === "object") {
    // 3D model file upload + separate thumbnail image
    const modelWrapper = document.createElement("div");
    modelWrapper.className = "admin-field admin-field--asset-upload";

    const modelLabel = document.createElement("label");
    modelLabel.textContent = "3D model (.glb or .gltf)";
    modelWrapper.appendChild(modelLabel);

    const modelFilename = document.createElement("div");
    modelFilename.className = "asset-upload__filename";
    modelFilename.textContent = currentData.assets?.model || "No file selected";
    modelWrapper.appendChild(modelFilename);

    const modelInput = document.createElement("input");
    modelInput.type = "file";
    modelInput.accept = ".glb,.gltf";
    modelInput.id = "field-assets-model";
    modelLabel.setAttribute("for", modelInput.id);
    modelWrapper.appendChild(modelInput);

    const modelStatus = document.createElement("div");
    modelStatus.className = "asset-upload__status";
    modelWrapper.appendChild(modelStatus);

    modelInput.addEventListener("change", async () => {
      const file = modelInput.files?.[0];
      if (!file) return;
      const itemId = getItemId();
      if (!itemId) { modelStatus.textContent = "Save an ID first before uploading."; return; }
      modelStatus.textContent = "Uploading…";
      modelInput.disabled = true;
      try {
        const { uploadModelAsset } = await import("../lib/upload.js");
        const result = await uploadModelAsset(file, itemId);
        handleChange("assets.model", result.model);
        modelFilename.textContent = result.model;
        modelStatus.textContent = "Uploaded";
      } catch (err) {
        modelStatus.textContent = `Error: ${err.message}`;
      } finally {
        modelInput.disabled = false;
      }
    });

    container.appendChild(modelWrapper);

    // Separate thumbnail (still image) for the object
    const thumbField = { id: "assets.thumbnail", label: "thumbnail image", type: "asset-upload", assetRole: "thumbnail" };
    handleChange._thumbSet = !!currentData.assets?.thumbnail;
    container.appendChild(makeAssetUploadField(thumbField, currentData.assets?.thumbnail, handleChange, getItemId));

    return container;
  }

  if (mode === "contraption") {
    // State builder: list of named states, each with an ordered image array
    const states = Array.isArray(currentData.assets?.states)
      ? currentData.assets.states.map(s => ({ name: s.name || "", images: Array.isArray(s.images) ? [...s.images] : [] }))
      : [];

    const stateList = document.createElement("div");
    stateList.className = "contraption-states";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "contraption-states__add";
    addBtn.textContent = "+ Add state";

    handleChange._thumbSet = !!currentData.assets?.thumbnail;

    function commitStates() {
      handleChange("assets.states", states.map(s => ({ name: s.name, images: [...s.images] })));
    }

    function renderStates() {
      stateList.innerHTML = "";
      states.forEach((state, si) => {
        const stateEl = document.createElement("div");
        stateEl.className = "contraption-state";

        const header = document.createElement("div");
        header.className = "contraption-state__header";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.placeholder = "state name (e.g. closed, open)";
        nameInput.value = state.name;
        nameInput.addEventListener("input", () => { states[si].name = nameInput.value; commitStates(); });

        const removeStateBtn = document.createElement("button");
        removeStateBtn.type = "button";
        removeStateBtn.textContent = "× Remove state";
        removeStateBtn.addEventListener("click", () => {
          states.splice(si, 1);
          renderStates();
          commitStates();
        });

        header.appendChild(nameInput);
        header.appendChild(removeStateBtn);
        stateEl.appendChild(header);

        // Per-state ordered image uploader — shares makeOrderedImageField logic inline
        // to keep state[si].images in sync with the local `states` array
        const imagesField = makeOrderedImageField({
          fieldId: `assets.states[${si}].images`,
          fieldLabel: "images for this state",
          uploadFn: async (file, itemId, index) => {
            const { uploadGalleryAsset } = await import("../lib/upload.js");
            return uploadGalleryAsset(file, itemId, index);
          },
          handleChange: (_, value) => {
            // Override: write directly into state images and re-commit
            states[si].images = Array.isArray(value) ? value : [];
            commitStates();
            // Auto-set thumbnail from first image of first state
            if (!handleChange._thumbSet && si === 0 && states[0].images[0]?.thumbnail) {
              handleChange("assets.thumbnail", states[0].images[0].thumbnail);
              handleChange._thumbSet = true;
            }
          },
          getItemId,
          initialValue: state.images,
        });

        stateEl.appendChild(imagesField);
        stateList.appendChild(stateEl);
      });
    }

    addBtn.addEventListener("click", () => {
      states.push({ name: "", images: [] });
      renderStates();
      commitStates();
    });

    renderStates();
    container.appendChild(stateList);
    container.appendChild(addBtn);
    return container;
  }

  return container;
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

// Builds and returns the inspection fieldset (mode select + dynamic asset section)
function makeInspectionFieldset(group, currentData, handleChange, getItemId, depth) {
  if (depth === "quick") return null;

  const fieldset = document.createElement("div");
  fieldset.className = "admin-fieldset";
  fieldset.dataset.group = group.id;

  const legend = document.createElement("div");
  legend.className = "admin-fieldset-legend";
  legend.textContent = group.label;
  fieldset.appendChild(legend);

  // Inspection mode select
  const modeField = group.fields[0]; // the inspection-select field
  const modeWrapper = document.createElement("div");
  modeWrapper.className = "admin-field";

  const modeLabel = document.createElement("label");
  modeLabel.textContent = modeField.label;
  modeLabel.setAttribute("for", "field-inspection");
  modeWrapper.appendChild(modeLabel);

  const modeSelect = document.createElement("select");
  modeSelect.id = "field-inspection";
  for (const opt of modeField.options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    modeSelect.appendChild(o);
  }
  const currentMode = currentData.inspection || "none";
  modeSelect.value = currentMode;
  modeWrapper.appendChild(modeSelect);
  fieldset.appendChild(modeWrapper);

  // Dynamic asset section — replaced on mode change
  const assetSection = document.createElement("div");
  assetSection.className = "inspection-asset-section";
  assetSection.appendChild(makeInspectionAwareAssets(currentMode, currentData, handleChange, getItemId));
  fieldset.appendChild(assetSection);

  modeSelect.addEventListener("change", () => {
    const newMode = modeSelect.value;
    handleChange("inspection", newMode);
    // Reset thumbnail tracking so the new mode's first upload sets it
    handleChange._thumbSet = !!currentData.assets?.thumbnail;
    assetSection.innerHTML = "";
    assetSection.appendChild(makeInspectionAwareAssets(newMode, currentData, handleChange, getItemId));
  });

  return fieldset;
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

    // Inspection-assets sentinel: render the mode select + dynamic asset section
    if (group.id === INSPECTION_ASSETS_SENTINEL.id) {
      const fieldset = makeInspectionFieldset(group, currentData, handleChange, getItemId, depth);
      if (fieldset) form.appendChild(fieldset);
      continue;
    }

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
