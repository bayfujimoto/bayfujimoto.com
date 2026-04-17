(function () {
  "use strict";

  const modal = document.getElementById("inspection-modal");
  const backdrop = document.getElementById("inspection-backdrop");
  if (!modal) return;

  const imageCol = document.getElementById("modal-image-col");
  const metaCol = document.getElementById("modal-meta-col");
  const closeBtn = document.getElementById("modal-close");
  const prevBtn = document.getElementById("modal-prev");
  const nextBtn = document.getElementById("modal-next");

  let items = [];
  let currentIndex = -1;

  function collectItems() {
    items = Array.from(document.querySelectorAll(".browse-item[data-item-id]"));
  }

  function open(index) {
    if (index < 0 || index >= items.length) return;
    currentIndex = index;
    const el = items[index];
    const d = el.dataset;

    // Update URL param without navigation
    const url = new URL(window.location);
    url.searchParams.set("item", d.itemId);
    history.replaceState(null, "", url);

    renderImage(d);
    renderMeta(d);

    modal.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add("modal-open");

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === items.length - 1;

    closeBtn.focus();
  }

  function close() {
    modal.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("modal-open");

    const url = new URL(window.location);
    url.searchParams.delete("item");
    history.replaceState(null, "", url);

    // Return focus to the item that was opened
    if (currentIndex >= 0 && items[currentIndex]) {
      items[currentIndex].querySelector(".browse-item__trigger").focus();
    }
    currentIndex = -1;
  }

  function renderImage(d) {
    let html = "";
    if (d.itemFront) {
      html += `<img class="modal-image modal-image--front" src="${d.itemFront}" alt="${d.itemTitle}" id="modal-img-front">`;
    }
    if (d.itemBack) {
      html += `<img class="modal-image modal-image--back" src="${d.itemBack}" alt="${d.itemTitle} (back)" id="modal-img-back" hidden>`;
      html += `<button class="modal-flip-btn" id="modal-flip" type="button">↔ flip</button>`;
    }
    if (d.itemFront) {
      html += `<button class="modal-zoom-btn" id="modal-zoom" type="button">zoom</button>`;
    }
    imageCol.innerHTML = html;

    const flipBtn = document.getElementById("modal-flip");
    if (flipBtn) {
      let showingFront = true;
      flipBtn.addEventListener("click", function () {
        showingFront = !showingFront;
        document.getElementById("modal-img-front").hidden = !showingFront;
        document.getElementById("modal-img-back").hidden = showingFront;
        flipBtn.textContent = showingFront ? "↔ flip" : "↔ flip (back)";
      });
    }
  }

  function renderMeta(d) {
    const tags = d.itemTags ? d.itemTags.split(", ").filter(Boolean) : [];
    const related = d.itemRelated ? d.itemRelated.split(",").filter(Boolean) : [];

    let html = `<h2 class="modal-title">${d.itemTitle}</h2>`;
    html += `<dl class="modal-fields">`;
    if (d.itemDate)   html += field("date",   d.itemDate);
    if (d.itemType)   html += field("type",   d.itemType);
    if (d.itemPlace)  html += field("place",  d.itemPlace);
    if (d.itemEvent)  html += field("event",  d.itemEvent);
    if (d.itemSource) html += field("source", d.itemSource);
    html += `</dl>`;

    if (d.itemNote) {
      html += `<div class="modal-section"><h3 class="modal-section__label">note</h3><p class="modal-note">${d.itemNote}</p></div>`;
    }

    if (related.length) {
      html += `<div class="modal-section"><h3 class="modal-section__label">related</h3><ul class="modal-related">`;
      related.forEach((id) => {
        const rel = items.find((el) => el.dataset.itemId === id);
        const label = rel ? rel.dataset.itemTitle : id;
        html += `<li><button class="modal-related__link" type="button" data-related-id="${id}">${label}</button></li>`;
      });
      html += `</ul></div>`;
    }

    if (tags.length) {
      html += `<div class="modal-section"><h3 class="modal-section__label">tags</h3><p class="modal-tags">${tags.join(" · ")}</p></div>`;
    }

    html += `<div class="modal-record"><span class="modal-record__id">${d.itemId}</span></div>`;

    metaCol.innerHTML = html;

    // Wire up related item buttons
    metaCol.querySelectorAll(".modal-related__link").forEach((btn) => {
      btn.addEventListener("click", function () {
        const id = this.dataset.relatedId;
        const idx = items.findIndex((el) => el.dataset.itemId === id);
        if (idx !== -1) open(idx);
      });
    });
  }

  function field(label, value) {
    return `<div class="modal-field"><dt class="modal-field__label">${label}</dt><dd class="modal-field__value">${value}</dd></div>`;
  }

  // --- Event wiring ---

  document.addEventListener("click", function (e) {
    const trigger = e.target.closest(".browse-item__trigger");
    if (!trigger) return;
    const item = trigger.closest(".browse-item[data-item-id]");
    const idx = items.indexOf(item);
    if (idx !== -1) open(idx);
  });

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  prevBtn.addEventListener("click", function () {
    if (currentIndex > 0) open(currentIndex - 1);
  });

  nextBtn.addEventListener("click", function () {
    if (currentIndex < items.length - 1) open(currentIndex + 1);
  });

  document.addEventListener("keydown", function (e) {
    if (!modal.hidden) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft" && currentIndex > 0) open(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < items.length - 1) open(currentIndex + 1);
    }
  });

  // --- Deep-link on page load ---

  function checkDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("item");
    if (!itemId) return;
    const idx = items.findIndex((el) => el.dataset.itemId === itemId);
    if (idx !== -1) open(idx);
  }

  collectItems();
  checkDeepLink();
})();
