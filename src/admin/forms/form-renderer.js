import { INSPECTION_ASSETS_SENTINEL } from "./type-fields.js";
import { makeSelect } from "../components/select.js";
import { makeCutoutControl } from "./cutout-control.js";

function makePanel(label) {
  const panel = document.createElement("div");
  panel.className = "admin-panel";
  const lbl = document.createElement("span");
  lbl.className = "admin-panel-label";
  lbl.textContent = label;
  panel.appendChild(lbl);
  return panel;
}

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

// Stored asset filenames may carry a "?v=<token>" cache-bust suffix (added on
// upload); strip it for human-facing display so the label shows a clean name.
function displayFilename(v) {
  return typeof v === "string" ? v.split("?")[0] : v;
}

function makeAssetUploadField(field, value, handleChange, getItemId) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-field";
  if (field.depth === "full") wrapper.dataset.depth = "full";

  // Tracks the current stored filename so a re-upload can tell the server which
  // old original to remove when the file type changes. Updated after each upload.
  let current = value;

  const label = document.createElement("label");
  label.textContent = field.label;
  wrapper.appendChild(label);

  // Right-column container
  const body = document.createElement("div");
  body.className = "asset-upload__body";

  const filename = document.createElement("div");
  filename.className = "asset-upload__filename";
  filename.textContent = displayFilename(value) || "—";
  body.appendChild(filename);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.id = `field-${field.id.replace(/\./g, "-")}`;
  fileInput.style.display = "none";
  body.appendChild(fileInput);

  const trigger = document.createElement("label");
  trigger.className = "asset-upload__trigger";
  trigger.setAttribute("for", fileInput.id);
  trigger.textContent = "choose file";
  body.appendChild(trigger);

  // Cut-out ("remove backing") control — only on scan-oriented fields (coffee
  // front/back, inspection=card front/back, inspection=object thumbnail).
  const cut = field.allowCutout ? makeCutoutControl() : null;
  if (cut) body.appendChild(cut.el);

  const status = document.createElement("div");
  status.className = "asset-upload__status";
  body.appendChild(status);

  wrapper.appendChild(body);

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
      // `replaces` lets the upload clean up the old original if the file type
      // changes. Scan-oriented fields also expose the cut-out control; auto-detect
      // from the chosen file (unless overridden) and pass the options through.
      const opts = { replaces: current };
      if (cut) {
        await cut.primeFromFile(file);
        Object.assign(opts, cut.getOptions());
        status.textContent = opts.cutout ? "Cutting out & uploading…" : "Uploading…";
      }
      const result = await uploadImageAsset(file, itemId, field.assetRole, opts);

      current = result.original;
      handleChange(field.id, result.original);
      // Skip thumbnail assignment for assets flagged skipThumbnail (e.g. a wide
      // backdrop) so the poster/cover stays the record thumbnail.
      if (!field.skipThumbnail && !handleChange._thumbSet) {
        handleChange("assets.thumbnail", result.thumbnail);
        handleChange._thumbSet = true;
      }

      filename.textContent = displayFilename(result.original);
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
  // opts: { fieldId, fieldLabel, uploadFn, handleChange, getItemId, initialValue, showAlt, itemDefaults }
  const { fieldId, fieldLabel, uploadFn, handleChange, getItemId, initialValue, showAlt = true, itemDefaults = {} } = opts;

  const items = Array.isArray(initialValue) ? initialValue.map(item =>
    typeof item === "string"
      ? { file: item, thumbnail: "", caption: "", alt: "", ...itemDefaults }
      : { ...itemDefaults, ...item }
  ) : [];

  const wrapper = document.createElement("div");
  wrapper.className = "admin-field admin-field--gallery-upload";
  wrapper.dataset.depth = "full";

  const label = document.createElement("label");
  label.textContent = fieldLabel;
  wrapper.appendChild(label);

  // Single value container (column 3), mirroring .asset-upload__body. Without it,
  // field-chrome's 4-column grid ([state][label][value][type]) scatters the list,
  // picker, cut-out control, and status across separate columns and rows.
  const body = document.createElement("div");
  body.className = "gallery-upload__value";
  wrapper.appendChild(body);

  const list = document.createElement("div");
  list.className = "gallery-upload__list";
  body.appendChild(list);

  const pickerLabel = document.createElement("label");
  pickerLabel.className = "gallery-upload__add-btn";

  const pickerText = document.createElement("span");
  pickerText.textContent = items.length === 0 ? "Upload images" : "+ Add more images";
  pickerLabel.appendChild(pickerText);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  fileInput.style.display = "none";
  pickerLabel.appendChild(fileInput);
  body.appendChild(pickerLabel);

  // Cut-out ("remove backing") control — shared reusable widget.
  const cut = makeCutoutControl();
  body.appendChild(cut.el);

  const status = document.createElement("div");
  status.className = "gallery-upload__status";
  body.appendChild(status);

  function commit() {
    handleChange(fieldId, items.length > 0 ? items.map(item => ({ ...item })) : []);
  }

  function renderList() {
    list.innerHTML = "";
    items.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "gallery-upload__row";

      // ── Left: thumbnail + filename ──────────────────────────
      const left = document.createElement("div");
      left.className = "gallery-upload__row-left";

      if (item.thumbnail) {
        const base = document.querySelector("meta[name=r2-base]")?.content || "";
        const thumb = document.createElement("img");
        thumb.className = "gallery-upload__thumb";
        thumb.alt = item.alt || item.file;
        thumb.src = base ? `${base}/thumbnails/${item.thumbnail}` : item.thumbnail;
        left.appendChild(thumb);
      }

      const fileLabel = document.createElement("div");
      fileLabel.className = "gallery-upload__filename";
      fileLabel.textContent = displayFilename(item.file);
      left.appendChild(fileLabel);

      row.appendChild(left);

      // ── Right: caption, alt, actions ───────────────────────
      const right = document.createElement("div");
      right.className = "gallery-upload__row-right";

      const captionInput = document.createElement("input");
      captionInput.type = "text";
      captionInput.placeholder = "caption";
      captionInput.value = item.caption || "";
      captionInput.addEventListener("input", () => { items[i].caption = captionInput.value; commit(); });
      right.appendChild(captionInput);

      if (!showAlt) {
        // Labor subitems: author-controlled display width in vw units
        const widthWrap = document.createElement("div");
        widthWrap.className = "gallery-upload__width-row";
        const widthLabel = document.createElement("span");
        widthLabel.className = "gallery-upload__width-label";
        widthLabel.textContent = "width (vw)";
        const widthInput = document.createElement("input");
        widthInput.type = "number";
        widthInput.min = "10";
        widthInput.max = "100";
        widthInput.placeholder = "60";
        widthInput.value = item.width_vw != null ? item.width_vw : "";
        widthInput.addEventListener("input", () => {
          const v = parseInt(widthInput.value, 10);
          items[i].width_vw = (!isNaN(v) && v >= 10 && v <= 100) ? v : null;
          commit();
        });
        widthWrap.appendChild(widthLabel);
        widthWrap.appendChild(widthInput);
        right.appendChild(widthWrap);
      }

      if (showAlt) {
        const altInput = document.createElement("input");
        altInput.type = "text";
        altInput.placeholder = "alt text";
        altInput.value = item.alt || "";
        altInput.addEventListener("input", () => { items[i].alt = altInput.value; commit(); });
        right.appendChild(altInput);
      }

      // Actions: reorder + remove
      const actions = document.createElement("div");
      actions.className = "gallery-upload__row-actions";

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
      actions.appendChild(reorderDiv);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "gallery-upload__remove";
      removeBtn.textContent = "remove";
      removeBtn.addEventListener("click", () => {
        items.splice(i, 1);
        renderList();
        commit();
        pickerText.textContent = items.length === 0 ? "Upload images" : "+ Add more images";
      });
      actions.appendChild(removeBtn);

      right.appendChild(actions);
      row.appendChild(right);

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

    // Auto pre-tick the backing toggle from the first file, unless the user set it.
    await cut.primeFromFile(files[0]);
    const cutoutOpts = cut.getOptions();

    try {
      const startIndex = items.length;
      for (let i = 0; i < files.length; i++) {
        status.textContent = `${cutoutOpts.cutout ? "Cutting out & uploading" : "Uploading"} ${i + 1} / ${files.length}…`;
        const result = await uploadFn(files[i], itemId, startIndex + i, cutoutOpts);
        items.push({ ...itemDefaults, ...result });

        if (!handleChange._thumbSet) {
          handleChange("assets.thumbnail", result.thumbnail);
          handleChange._thumbSet = true;
        }
      }
      renderList();
      commit();
      pickerText.textContent = "+ Add more images";
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

function makeModelUploadField(field, value, handleChange, getItemId) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-field";
  if (field.depth === "full") wrapper.dataset.depth = "full";

  const label = document.createElement("label");
  label.textContent = field.label;
  wrapper.appendChild(label);

  // Right-column container
  const body = document.createElement("div");
  body.className = "asset-upload__body";

  if (field.hint) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = field.hint;
    body.appendChild(hint);
  }

  const filename = document.createElement("div");
  filename.className = "asset-upload__filename";
  filename.textContent = value || "—";
  body.appendChild(filename);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".glb,.gltf";
  fileInput.id = `field-${field.id.replace(/\./g, "-")}`;
  fileInput.style.display = "none";
  body.appendChild(fileInput);

  const trigger = document.createElement("label");
  trigger.className = "asset-upload__trigger";
  trigger.setAttribute("for", fileInput.id);
  trigger.textContent = "choose file";
  body.appendChild(trigger);

  const status = document.createElement("div");
  status.className = "asset-upload__status";
  body.appendChild(status);

  wrapper.appendChild(body);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const itemId = getItemId();
    if (!itemId) { status.textContent = "Save an ID first before uploading."; return; }
    status.textContent = "Uploading…";
    fileInput.disabled = true;
    try {
      const { uploadModelAsset } = await import("../lib/upload.js");
      const result = await uploadModelAsset(file, itemId);
      handleChange(field.id, result.model);
      filename.textContent = result.model;
      status.textContent = "Uploaded";
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    } finally {
      fileInput.disabled = false;
    }
  });

  return wrapper;
}

function makeSubitemListField(field, initialValue, handleChange, getItemId) {
  return makeOrderedImageField({
    fieldId:      field.id,
    fieldLabel:   field.label,
    showAlt:      false,
    itemDefaults: { type: "image" },
    uploadFn: async (file, itemId, index, opts) => {
      const { uploadLaborImage } = await import("../lib/upload.js");
      return uploadLaborImage(file, itemId, index, opts);
    },
    handleChange,
    getItemId,
    initialValue,
  });
}

function makeGalleryUploadField(field, initialValue, handleChange, getItemId) {
  return makeOrderedImageField({
    fieldId: field.id,
    fieldLabel: field.label,
    uploadFn: async (file, itemId, index, opts) => {
      const { uploadGalleryAsset } = await import("../lib/upload.js");
      return uploadGalleryAsset(file, itemId, index, opts);
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
    const frontField = { id: "assets.front", label: "front", type: "asset-upload", assetRole: "front", allowCutout: true };
    const backField  = { id: "assets.back",  label: "back (optional)", type: "asset-upload", assetRole: "back", allowCutout: true };
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
      uploadFn: async (file, itemId, index, opts) => {
        const { uploadDocumentPage } = await import("../lib/upload.js");
        return uploadDocumentPage(file, itemId, index, opts);
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
    const thumbField = { id: "assets.thumbnail", label: "thumbnail image", type: "asset-upload", assetRole: "thumbnail", allowCutout: true };
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
          uploadFn: async (file, itemId, index, opts) => {
            const { uploadGalleryAsset } = await import("../lib/upload.js");
            return uploadGalleryAsset(file, itemId, index, opts);
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
  // Required marker is rendered via CSS (::after on label[data-required="true"])
  // so the asterisk attaches to the field name with no space and can be styled.
  if (field.required) label.dataset.required = "true";
  wrapper.appendChild(label);

  // Custom select — rendered separately (no native <select>, no input-wrap prompt)
  if (field.type === "select") {
    const labelId = `label-${field.id.replace(/\./g, "-")}`;
    label.id = labelId;

    const handle = makeSelect(
      (field.options || []).map(o => ({ value: o, label: o })),
      value ?? field.options?.[0] ?? "",
      (v) => onChange(field.id, v),
      { className: field.statusColors ? "admin-select--status" : undefined }
    );
    handle.el.setAttribute("aria-labelledby", labelId);

    wrapper.appendChild(handle.el);

    if (field.hint) {
      const hint = document.createElement("div");
      hint.className = "field-hint";
      hint.textContent = field.hint;
      wrapper.appendChild(hint);
    }

    return wrapper;
  }

  let input;

  if (field.type === "textarea") {
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

  const isArea = ['textarea', 'id-list', 'pair-list'].includes(field.type);
  const inputWrap = document.createElement('div');
  inputWrap.className = 'admin-input-wrap' + (isArea ? ' is-area' : '');
  inputWrap.appendChild(input);
  wrapper.appendChild(inputWrap);

  if (field.hint) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = field.hint;
    wrapper.appendChild(hint);
  }

  return wrapper;
}

// Builds and returns the inspection fieldset (mode select + dynamic asset section)
function makeInspectionFieldset(group, currentData, handleChange, getItemId) {
  const fieldset = makePanel(group.label);
  fieldset.dataset.group = group.id;

  // Inspection mode select
  const modeField = group.fields[0]; // the inspection-select field
  const modeWrapper = document.createElement("div");
  modeWrapper.className = "admin-field";

  const modeLabel = document.createElement("label");
  const modeLabelId = "label-inspection";
  modeLabel.id = modeLabelId;
  modeLabel.textContent = modeField.label;
  modeWrapper.appendChild(modeLabel);

  const currentMode = currentData.inspection || "none";

  // Dynamic asset section — declared before modeHandle so the callback can reference it
  const assetSection = document.createElement("div");
  assetSection.className = "inspection-asset-section";

  const modeHandle = makeSelect(
    modeField.options.map(o => ({ value: o, label: o })),
    currentMode,
    (newMode) => {
      handleChange("inspection", newMode);
      handleChange._thumbSet = !!currentData.assets?.thumbnail;
      assetSection.innerHTML = "";
      assetSection.appendChild(makeInspectionAwareAssets(newMode, currentData, handleChange, getItemId));
    }
  );
  modeHandle.el.setAttribute("aria-labelledby", modeLabelId);

  modeWrapper.appendChild(modeHandle.el);
  fieldset.appendChild(modeWrapper);

  assetSection.appendChild(makeInspectionAwareAssets(currentMode, currentData, handleChange, getItemId));
  fieldset.appendChild(assetSection);

  return fieldset;
}

export function renderForm(container, groups, initialData, onChange) {
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
    // Inspection-assets sentinel: render the mode select + dynamic asset section
    if (group.id === INSPECTION_ASSETS_SENTINEL.id) {
      const fieldset = makeInspectionFieldset(group, currentData, handleChange, getItemId);
      if (fieldset) form.appendChild(fieldset);
      continue;
    }

    const fieldset = makePanel(group.label);
    fieldset.dataset.group = group.id;

    // Reset per-fieldset thumbnail tracking — preserve existing thumbnail if already set
    handleChange._thumbSet = !!currentData.assets?.thumbnail;

    for (const field of group.fields) {
      const value = getNestedValue(currentData, field.id);
      let el;
      if (field.type === "asset-upload") {
        el = makeAssetUploadField(field, value, handleChange, getItemId);
      } else if (field.type === "gallery-upload") {
        el = makeGalleryUploadField(field, value, handleChange, getItemId);
      } else if (field.type === "model-upload") {
        el = makeModelUploadField(field, value, handleChange, getItemId);
      } else if (field.type === "subitem-list") {
        el = makeSubitemListField(field, value, handleChange, getItemId);
      } else {
        el = makeField(field, value, handleChange);
      }
      fieldset.appendChild(el);
    }

    // Only append fieldset if it has visible inputs or gallery fields
    if (fieldset.querySelector("input, select, .admin-select, textarea, .admin-field--gallery-upload")) {
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
