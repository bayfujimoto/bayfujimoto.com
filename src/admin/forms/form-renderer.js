import { INSPECTION_ASSETS_SENTINEL } from "./type-fields.js";
import { makeSelect } from "../components/select.js";
import { makeDatePicker, formatDisplayDate } from "../components/date-picker.js";
import { makeCutoutControl } from "./cutout-control.js";
import { assetFieldRow } from "./field-row.js";
import { imageUrl } from "../../app/image-url.js";
import { applyFieldChrome } from "./field-chrome.js";
import { makeConstellationField } from "./constellation-field.js";

// A form section: a labelled panel whose heading collapses/expands the fields
// below it. The heading is a real <button> so it's keyboard-reachable; clicking
// it toggles `.is-collapsed` on the panel and the CSS hides the non-heading
// children. Chrome / edit-toggle / nav all query `.admin-field` recursively and
// skip display:none rows, so collapsing a section leaves them intact.
function makePanel(label) {
  const panel = document.createElement("div");
  panel.className = "admin-panel";

  const heading = document.createElement("button");
  heading.type = "button";
  heading.className = "admin-panel-heading";
  heading.setAttribute("aria-expanded", "true");

  const marker = document.createElement("span");
  marker.className = "admin-panel-heading-marker";
  marker.setAttribute("aria-hidden", "true");
  heading.appendChild(marker);

  const lbl = document.createElement("span");
  lbl.className = "admin-panel-heading-label";
  lbl.textContent = label;
  heading.appendChild(lbl);

  heading.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("is-collapsed");
    heading.setAttribute("aria-expanded", String(!collapsed));
  });

  panel.appendChild(heading);
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
  // Tracks the current stored filename so a re-upload can tell the server which
  // old original to remove when the file type changes. Updated after each upload.
  let current = value;

  // display:contents group so the image row and the per-asset cut-out rows lay
  // out as siblings in the form grid, each as its own state·FIELD·VALUE·TYPE row.
  const group = document.createElement("div");
  group.className = "asset-upload-group";

  // ── Value cell for the image row: preview + filename + choose/replace ──
  const media = document.createElement("div");
  media.className = "asset-media";

  // Image preview (display-size derivative), so the asset can be reviewed before
  // saving/committing. Shown on load if there's already a value and refreshed
  // after each upload; a load error (e.g. a missing derivative) hides it rather
  // than leaving a broken-image icon. For cut-out uploads the display derivative
  // is the cut-out itself, so the preview reflects the removed backing.
  const preview = document.createElement("img");
  preview.className = "asset-upload__preview";
  preview.alt = "";
  preview.addEventListener("error", () => { preview.style.display = "none"; });
  const setPreview = (name) => {
    const url = name ? imageUrl(name, "display") : null;
    if (url) { preview.src = url; preview.style.display = ""; }
    else { preview.removeAttribute("src"); preview.style.display = "none"; }
  };
  setPreview(value);
  media.appendChild(preview);

  const filename = document.createElement("div");
  filename.className = "asset-media__file" + (value ? "" : " is-empty");
  filename.textContent = displayFilename(value) || "no image";
  media.appendChild(filename);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.id = `field-${field.id.replace(/\./g, "-")}`;
  fileInput.style.display = "none";
  media.appendChild(fileInput);

  const trigger = document.createElement("label");
  trigger.className = "asset-choose";
  trigger.setAttribute("for", fileInput.id);
  trigger.textContent = value ? "replace" : "choose file";
  media.appendChild(trigger);

  // Rotate the uploaded image in 90° steps (hidden until there is one).
  const rotateWrap = document.createElement("div");
  rotateWrap.className = "asset-rotate";
  const doRotate = async (turns) => {
    if (!current) return;
    status.textContent = "Rotating…";
    status.classList.add("is-busy");
    fileInput.disabled = true;
    try {
      const { rotateUploadedImage } = await import("../lib/upload.js");
      const result = await rotateUploadedImage(current, turns);
      current = result.original;
      handleChange(field.id, result.original);
      // Same thumbnail-claim rule as a re-upload (see the change handler).
      if (!field.skipThumbnail && (handleChange._thumbField == null || handleChange._thumbField === field.id)) {
        handleChange("assets.thumbnail", result.thumbnail);
        handleChange._thumbField = field.id;
      }
      filename.textContent = displayFilename(result.original);
      setPreview(result.original);
      status.textContent = "Rotated";
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    } finally {
      fileInput.disabled = false;
      status.classList.remove("is-busy");
    }
  };
  const mkRotate = (turns, glyph, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = glyph;
    b.setAttribute("aria-label", label);
    b.title = label.toLowerCase();
    b.addEventListener("click", () => doRotate(turns));
    rotateWrap.appendChild(b);
  };
  mkRotate(-1, "⟲", "Rotate 90° counter-clockwise");
  mkRotate(1, "⟳", "Rotate 90° clockwise");
  rotateWrap.style.display = value ? "" : "none";
  media.appendChild(rotateWrap);

  const status = document.createElement("div");
  status.className = "asset-upload__status";
  media.appendChild(status);

  group.appendChild(assetFieldRow(field.label, "image", media));

  // Cut-out ("remove backing") rows — per asset; only on scan-oriented fields
  // (coffee front/back, inspection=card front/back, inspection=object thumbnail).
  const cut = field.allowCutout ? makeCutoutControl() : null;
  if (cut) cut.rows.forEach((r) => group.appendChild(r));

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const itemId = getItemId();
    if (!itemId) {
      status.textContent = "Save an ID first before uploading.";
      return;
    }

    status.textContent = "Uploading…";
    status.classList.add("is-busy");
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
      // Keep the record thumbnail in sync. The first eligible field claims it and
      // then refreshes it on every re-upload, so a replacement never leaves the
      // thumbnail pointing at a stale (cached) or cleaned-up derivative. Other
      // fields don't steal an already-claimed thumbnail, and skipThumbnail assets
      // (e.g. a wide backdrop) never claim it.
      if (!field.skipThumbnail && (handleChange._thumbField == null || handleChange._thumbField === field.id)) {
        handleChange("assets.thumbnail", result.thumbnail);
        handleChange._thumbField = field.id;
      }

      filename.textContent = displayFilename(result.original);
      filename.classList.remove("is-empty");
      trigger.textContent = "replace";
      rotateWrap.style.display = "";
      setPreview(result.original);
      status.textContent = "Uploaded";
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    } finally {
      fileInput.disabled = false;
      status.classList.remove("is-busy");
    }
  });

  return group;
}

// Shared ordered-image-list uploader used by gallery and document modes
function makeOrderedImageField(opts) {
  // opts: { fieldId, fieldLabel, uploadFn, handleChange, getItemId, initialValue, showAlt, itemDefaults }
  const { fieldId, fieldLabel, uploadFn, handleChange, getItemId, initialValue, showAlt = true, itemDefaults = {}, ownsThumbnail = false } = opts;

  const items = Array.isArray(initialValue) ? initialValue.map(item =>
    typeof item === "string"
      ? { file: item, thumbnail: "", caption: "", alt: "", ...itemDefaults }
      : { ...itemDefaults, ...item }
  ) : [];

  // display:contents group so the gallery row and the per-set cut-out rows lay
  // out as siblings in the form grid, each as its own state·FIELD·VALUE·TYPE row.
  const group = document.createElement("div");
  group.className = "gallery-upload-group";

  // Single value container (column 3) holding the image list, the picker, and the
  // status line — keeps them in one grid cell instead of scattering.
  const body = document.createElement("div");
  body.className = "gallery-upload__value";

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

  const status = document.createElement("div");
  status.className = "gallery-upload__status";
  body.appendChild(status);

  // The gallery images row. Keep the --gallery-upload class + data-depth so the
  // existing CSS and the "fieldset has a gallery" visibility check still match.
  const galleryRow = assetFieldRow(fieldLabel, "gallery", body);
  galleryRow.classList.add("admin-field--gallery-upload");
  galleryRow.dataset.depth = "full";
  group.appendChild(galleryRow);

  // Cut-out ("remove backing") rows — shared reusable widget, one set for the list.
  const cut = makeCutoutControl();
  cut.rows.forEach((r) => group.appendChild(r));

  function commit() {
    handleChange(fieldId, items.length > 0 ? items.map(item => ({ ...item })) : []);
    // Keep the record thumbnail pointed at the current first image, so it stays a
    // valid, cache-busted reference through upload / re-upload / remove / reorder
    // (previously it was set once and left stale — or dangling after cleanup).
    if (ownsThumbnail) handleChange("assets.thumbnail", items[0]?.thumbnail || "");
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
        const thumb = document.createElement("img");
        thumb.className = "gallery-upload__thumb";
        thumb.alt = item.alt || displayFilename(item.file);
        // Resolve against VITE_R2_BASE_URL (and honor any ?v= cache-bust token)
        // via the shared helper — the old meta[name=r2-base] lookup was never set,
        // so previews always fell back to an unresolvable bare filename.
        thumb.src = imageUrl(item.thumbnail, "thumbnail");
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

      // Rotate the uploaded image in 90° steps: the original is fetched back
      // from R2, rotated on a canvas, and all derivatives re-derived under the
      // same name (see rotateUploadedImage in lib/upload.js).
      const rotateDiv = document.createElement("div");
      rotateDiv.className = "gallery-upload__reorder gallery-upload__rotate";
      const doRotate = async (turns) => {
        if (!items[i]?.file) return;
        status.textContent = "Rotating…";
        status.classList.add("is-busy");
        fileInput.disabled = true;
        try {
          const { rotateUploadedImage } = await import("../lib/upload.js");
          const r = await rotateUploadedImage(items[i].file, turns);
          items[i].file = r.original;
          items[i].thumbnail = r.thumbnail;
          if (r.cutout) { items[i].cutout = true; items[i].cutout_params = r.cutout_params; }
          renderList();
          commit();
          status.textContent = "Rotated";
        } catch (err) {
          status.textContent = `Error: ${err.message}`;
        } finally {
          fileInput.disabled = false;
          status.classList.remove("is-busy");
        }
      };
      const ccwBtn = document.createElement("button");
      ccwBtn.type = "button";
      ccwBtn.textContent = "⟲";
      ccwBtn.setAttribute("aria-label", "Rotate 90° counter-clockwise");
      ccwBtn.title = "rotate 90° counter-clockwise";
      ccwBtn.addEventListener("click", () => doRotate(-1));
      const cwBtn = document.createElement("button");
      cwBtn.type = "button";
      cwBtn.textContent = "⟳";
      cwBtn.setAttribute("aria-label", "Rotate 90° clockwise");
      cwBtn.title = "rotate 90° clockwise";
      cwBtn.addEventListener("click", () => doRotate(1));
      rotateDiv.appendChild(ccwBtn);
      rotateDiv.appendChild(cwBtn);
      actions.appendChild(rotateDiv);

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
    status.classList.add("is-busy");

    // Auto pre-tick the backing toggle from the first file, unless the user set it.
    await cut.primeFromFile(files[0]);
    const cutoutOpts = cut.getOptions();

    try {
      const startIndex = items.length;
      for (let i = 0; i < files.length; i++) {
        status.textContent = `${cutoutOpts.cutout ? "Cutting out & uploading" : "Uploading"} ${i + 1} / ${files.length}…`;
        const result = await uploadFn(files[i], itemId, startIndex + i, cutoutOpts);
        items.push({ ...itemDefaults, ...result });
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
      status.classList.remove("is-busy");
    }
  });

  return group;
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
    ownsThumbnail: true,
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
    ownsThumbnail: true,
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
      ownsThumbnail: true,
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

function makeField(field, value, onChange, getValue) {
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

  // Custom date picker — an admin-styled calendar instead of the native
  // <input type=date>; clicking the field opens the calendar.
  if (field.type === "date") {
    const labelId = `label-${field.id.replace(/\./g, "-")}`;
    label.id = labelId;

    const handle = makeDatePicker(value ?? "", (v) => onChange(field.id, v));
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

  // Autofill button — derives this field's value from another field (e.g.
  // display date from sort date). Sits beside the value and stays clickable in
  // both display and edit modes.
  if (field.autofillFrom) {
    inputWrap.classList.add('has-autofill');
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = 'admin-field-autofill';
    autoBtn.textContent = 'auto';
    autoBtn.title = `Fill from ${field.autofillFrom.replace(/_/g, ' ')}`;
    autoBtn.addEventListener('click', () => {
      input.value = formatDisplayDate(getValue?.(field.autofillFrom) || "");
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    inputWrap.appendChild(autoBtn);
  }

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
      handleChange._thumbField = null;  // re-establish thumbnail ownership in the new mode
      assetSection.innerHTML = "";
      assetSection.appendChild(makeInspectionAwareAssets(newMode, currentData, handleChange, getItemId));
      // Re-apply the 4-column field chrome ([state][label][value][type]) to the
      // freshly rendered upload widgets. Initial render is decorated by
      // edit-item.js / new-item.js after mount; a mode switch re-renders only
      // this section, so without re-decorating here the new rows miss the state
      // and type slots and their grid columns (1.5ch 14ch 1fr 8ch) collapse.
      applyFieldChrome(assetSection);
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

  // Read the current value of another field (used by autofill buttons that
  // derive one field from another, e.g. display date from sort date).
  function getValue(fieldId) {
    return getNestedValue(currentData, fieldId);
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
      } else if (field.type === "constellation-list") {
        el = makeConstellationField(field, value, handleChange, getValue);
      } else {
        el = makeField(field, value, handleChange, getValue);
      }
      fieldset.appendChild(el);
    }

    // Only append fieldset if it has visible inputs or gallery fields
    if (fieldset.querySelector("input, select, .admin-select, .admin-datepicker, textarea, .admin-field--gallery-upload")) {
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
