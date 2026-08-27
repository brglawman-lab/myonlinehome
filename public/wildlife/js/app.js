/* app.js - wires Store + Taxonomy + YWMap into the page. */
(() => {
  const RARE_STATUSES = ["vagrant", "absent"];

  let selectedSpeciesId = null;
  let activeCounty = "all";
  let bigMapReady = false;
  let pickedLatLon = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function countyScopedSeenChecker(county) {
    if (county === "all") return (id) => Store.isSeen(id);
    return (id) => Store.seenCounties(id).includes(county);
  }

  function getFilteredSpecies() {
    const search = $("#search-input").value.trim().toLowerCase();
    const seenFilterVal = $("#seen-filter").value;
    const showRarities = $("#rarities-toggle").checked;
    const seenChecker = countyScopedSeenChecker(activeCounty);

    return Store.allSpecies().filter((sp) => {
      if (!showRarities && RARE_STATUSES.includes(sp.occurrenceStatus)) return false;
      if (search && !sp.commonName.toLowerCase().includes(search)) return false;
      const seen = seenChecker(sp.id);
      if (seenFilterVal === "seen" && !seen) return false;
      if (seenFilterVal === "unseen" && seen) return false;
      return true;
    });
  }

  function refreshTree(opts = {}) {
    const list = getFilteredSpecies();
    if ($("#search-input").value.trim()) {
      Taxonomy.expandAll(list);
    }
    Taxonomy.render(list, {
      onSelect: selectSpecies,
      seenChecker: countyScopedSeenChecker(activeCounty),
      selectedId: selectedSpeciesId,
      ...opts,
    });
  }

  function refreshHeadlineStats() {
    const all = Store.allSpecies();
    const seenChecker = countyScopedSeenChecker(activeCounty);
    const seenCount = all.filter((s) => seenChecker(s.id)).length;
    const label = activeCounty === "all" ? "Yorkshire" : activeCounty;
    const el = $("#headline-stats");
    el.innerHTML = `
      <div><strong>${seenCount} / ${all.length}</strong>logged in ${label}</div>
      <div><strong>${Store.allSightings().length}</strong>total sightings logged</div>
    `;
  }

  function statusPillHtml(sp) {
    const pills = [];
    if (sp.occurrenceStatus && sp.occurrenceStatus !== "resident") {
      pills.push(`<span class="status-pill ${sp.occurrenceStatus}">${sp.occurrenceStatus}</span>`);
    }
    if (sp.conservationStatus) {
      pills.push(`<span class="status-pill">${sp.conservationStatus}</span>`);
    }
    if (sp.custom) pills.push(`<span class="status-pill">added by you</span>`);
    return pills.join(" ");
  }

  // ---------------- External "learn more" links --------------------------
  // We don't host photos or write our own habitat notes: neither is
  // something we can do reliably for ~470 species (photo rights are
  // per-image, and "where to find it" text needs a naturalist checking
  // every entry). Instead we link out to three sources that already
  // maintain that information. These are built from the common name only
  // (we don't have scientific names in the checklist), using each site's
  // search entry point rather than a guessed direct-page URL, so a link
  // never 404s even for an unusual or ambiguous name -- worst case it
  // lands on a search results page instead of the exact article.
  function speciesLinks(sp) {
    const name = sp.commonName;
    const q = encodeURIComponent(name);
    const wikiTitle = encodeURIComponent(name.replace(/ /g, "_"));
    return {
      wikipedia: `https://en.wikipedia.org/wiki/Special:Search/${wikiTitle}`,
      nbnAtlas: `https://species.nbnatlas.org/search?q=${q}`,
      inaturalist: `https://www.inaturalist.org/taxa/search?q=${q}`,
    };
  }

  function speciesLinksHtml(sp) {
    const links = speciesLinks(sp);
    return `
      <div class="detail-links">
        <a href="${links.wikipedia}" target="_blank" rel="noopener">Wikipedia &#8599;</a>
        <a href="${links.nbnAtlas}" target="_blank" rel="noopener">NBN Atlas: where it's been recorded &#8599;</a>
        <a href="${links.inaturalist}" target="_blank" rel="noopener">iNaturalist: photos &amp; sightings &#8599;</a>
      </div>
      <p class="hint detail-links__note">These search the site directly by common name &mdash; if the top result isn't the right species, try the site's own search from there.</p>
    `;
  }

  function selectSpecies(id) {
    selectedSpeciesId = id;
    const sp = Store.getSpecies(id);
    const panel = $("#detail-panel");
    if (!sp) {
      panel.innerHTML = `<p class="detail-placeholder">That species couldn't be found.</p>`;
      return;
    }
    const sightings = Store.getSightings(id);
    panel.innerHTML = `
      <h2>${escapeHtml(sp.commonName)}</h2>
      <div class="detail-meta">${escapeHtml(sp.class)} &middot; ${escapeHtml(titleCase(sp.order))} &middot; ${escapeHtml(sp.family)}</div>
      <div>${statusPillHtml(sp)}</div>
      ${speciesLinksHtml(sp)}
      <div id="detail-mini-map" class="detail-mini-map"></div>
      <div class="btn-row">
        <button class="btn" id="log-btn">Log a sighting</button>
      </div>
      <h3>Your sightings (${sightings.length})</h3>
      <div id="detail-sightings-list"></div>
    `;
    renderDetailSightings(id);
    YWMap.renderDetailMap("detail-mini-map", sightings);
    $("#log-btn").addEventListener("click", () => openLogModal(id));

    // Reflect selection in the tree without a full rebuild.
    $$(".species-row.selected").forEach((r) => r.classList.remove("selected"));
    const row = $(`.species-row[data-id="${CSS.escape(id)}"]`);
    if (row) row.classList.add("selected");
  }

  function renderDetailSightings(speciesId) {
    const list = $("#detail-sightings-list");
    const sightings = Store.getSightings(speciesId);
    if (!sightings.length) {
      list.innerHTML = `<p class="hint">No sightings logged yet.</p>`;
      return;
    }
    list.innerHTML = sightings.map(sightingCardHtml).join("");
    $$(".sighting-card__delete", list).forEach((btn) =>
      btn.addEventListener("click", () => {
        Store.deleteSighting(btn.dataset.id);
        selectSpecies(speciesId);
        refreshTree();
        refreshHeadlineStats();
      })
    );
  }

  function sightingCardHtml(s) {
    return `
      <div class="sighting-card">
        <div class="sighting-card__meta">${escapeHtml(s.date)}${s.time ? " " + escapeHtml(s.time) : ""} &middot; ${escapeHtml(s.locationName)} (${escapeHtml(s.county)})</div>
        ${s.note ? `<div class="sighting-card__note">${escapeHtml(s.note)}</div>` : ""}
        <div class="sighting-card__actions">
          <button class="sighting-card__delete" data-id="${s.id}" type="button">Delete</button>
        </div>
      </div>`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function titleCase(order) {
    if (order === order.toUpperCase()) return order.charAt(0) + order.slice(1).toLowerCase();
    return order;
  }

  // ---------------- Log sighting modal --------------------------------
  function openLogModal(speciesId) {
    const overlay = $("#log-modal-overlay");
    const form = $("#log-sighting-form");
    form.reset();
    form.speciesId.value = speciesId;
    const now = new Date();
    form.date.value = now.toISOString().slice(0, 10);
    form.time.value = "";
    if (activeCounty !== "all") form.county.value = activeCounty;
    pickedLatLon = null;
    $("#latlon-input").value = "";
    overlay.hidden = false;
    YWMap.initPickMap("log-mini-map", (lat, lon) => {
      pickedLatLon = [lat, lon];
      $("#latlon-input").value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    });
  }

  function closeLogModal() {
    $("#log-modal-overlay").hidden = true;
  }

  function parseLatLonInput(value) {
    const m = value.match(/(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/);
    if (!m) return null;
    return [parseFloat(m[1]), parseFloat(m[3])];
  }

  // ---------------- Place search (map tab + log modal) ------------------
  async function doBigMapPlaceSearch() {
    const input = $("#map-place-search");
    const q = input.value.trim();
    const status = $("#map-search-status");
    if (!q) return;
    status.textContent = "Searching…";
    try {
      const hit = await YWMap.searchBigMapPlace(q);
      status.textContent = hit
        ? `Showing ${hit.display_name}.`
        : `No place found for "${q}" — try a different spelling or a nearby town.`;
    } catch (err) {
      status.textContent = `Place search failed: ${err.message}`;
    }
  }

  async function doPickPlaceSearch() {
    const input = $("#pick-place-search");
    const q = input.value.trim();
    const status = $("#pick-place-status");
    if (!q) return;
    status.textContent = "Searching…";
    try {
      const hit = await YWMap.searchPickMapPlace(q);
      status.textContent = hit
        ? `Pinned ${hit.display_name}.`
        : `No place found for "${q}" — try a different spelling or a nearby town.`;
    } catch (err) {
      status.textContent = `Search failed: ${err.message}`;
    }
  }

  // ---------------- Snapshot for pasting into a Claude chat --------------
  function buildClaudeSnapshot() {
    const all = Store.allSpecies();
    const unseen = all.filter((s) => !Store.isSeen(s.id));
    const groups = {};
    for (const s of unseen) (groups[s.class] = groups[s.class] || []).push(s.commonName);

    const lines = [];
    lines.push("Yorkshire Wildlife Tracker status snapshot");
    lines.push(`Seen: ${all.length - unseen.length} / ${all.length}`);
    lines.push("");
    lines.push("Unseen species by class:");
    for (const [cls, names] of Object.entries(groups)) {
      lines.push(`- ${cls} (${names.length}): ${names.join(", ")}`);
    }
    lines.push("");
    const sorted = [...Store.allSightings()].sort((a, b) => (a.date < b.date ? 1 : -1));
    const recent = sorted.slice(0, 20).map((s) => {
      const sp = Store.getSpecies(s.speciesId);
      return `${s.date}${s.time ? " " + s.time : ""} — ${sp ? sp.commonName : s.speciesId} — ${s.locationName}, ${s.county}`;
    });
    lines.push(`Recent sightings (showing ${recent.length} of ${sorted.length}):`);
    lines.push(...(recent.length ? recent : ["(none logged yet)"]));
    return lines.join("\n");
  }

  // ---------------- Sightings tab --------------------------------------
  function refreshSightingsView() {
    const search = $("#sightings-search").value.trim().toLowerCase();
    const sort = $("#sightings-sort").value;
    let list = Store.allSightings().map((s) => ({ ...s, species: Store.getSpecies(s.speciesId) }));

    if (search) {
      list = list.filter((s) =>
        (s.species?.commonName || "").toLowerCase().includes(search) ||
        (s.locationName || "").toLowerCase().includes(search) ||
        (s.note || "").toLowerCase().includes(search)
      );
    }
    if (sort === "date-desc") list.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (sort === "date-asc") list.sort((a, b) => (a.date > b.date ? 1 : -1));
    if (sort === "species") list.sort((a, b) => (a.species?.commonName || "").localeCompare(b.species?.commonName || ""));

    const el = $("#sightings-list");
    if (!list.length) {
      el.innerHTML = `<p class="hint">No sightings match. Log one from the Browse tab.</p>`;
      return;
    }
    el.innerHTML = list
      .map(
        (s) => `
      <div class="sighting-card">
        <div>
          <strong>${s.species ? escapeHtml(s.species.commonName) : "(unknown species)"}</strong>
          <div class="sighting-card__meta">${escapeHtml(s.date)}${s.time ? " " + escapeHtml(s.time) : ""} &middot; ${escapeHtml(s.locationName)} (${escapeHtml(s.county)})</div>
          ${s.note ? `<div class="sighting-card__note">${escapeHtml(s.note)}</div>` : ""}
        </div>
        <div class="sighting-card__actions">
          <button class="sighting-card__delete" data-id="${s.id}" data-species="${s.speciesId}" type="button">Delete</button>
        </div>
      </div>`
      )
      .join("");
    $$(".sighting-card__delete", el).forEach((btn) =>
      btn.addEventListener("click", () => {
        Store.deleteSighting(btn.dataset.id);
        refreshSightingsView();
        refreshTree();
        refreshHeadlineStats();
        if (selectedSpeciesId === btn.dataset.species) selectSpecies(selectedSpeciesId);
      })
    );
  }

  // ---------------- Map tab ---------------------------------------------
  function populateMapSpeciesSelect() {
    const sel = $("#map-species-select");
    const seenIds = new Set(Store.allSightings().map((s) => s.speciesId));
    const seenSpecies = Store.allSpecies()
      .filter((s) => seenIds.has(s.id))
      .sort((a, b) => a.commonName.localeCompare(b.commonName));
    sel.innerHTML =
      `<option value="">All my sightings</option>` +
      seenSpecies.map((s) => `<option value="${s.id}">${escapeHtml(s.commonName)}</option>`).join("");
  }

  async function refreshMapView() {
    if (!bigMapReady) {
      await YWMap.initBigMap({
        onCountyClick: (county) => {
          activeCounty = county;
          $("#county-filter").value = county;
          switchView("browse");
          refreshTree();
          refreshHeadlineStats();
        },
      });
      bigMapReady = true;
    }
    populateMapSpeciesSelect();
    const speciesId = $("#map-species-select").value;
    const sp = speciesId ? Store.getSpecies(speciesId) : null;
    const sightings = speciesId ? Store.getSightings(speciesId) : Store.allSightings();
    await YWMap.showSpecies(sp, sightings);
  }

  // ---------------- Tabs -------------------------------------------------
  function switchView(view) {
    $$(".tab").forEach((t) => {
      const active = t.dataset.view === view;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    $$("[data-view-panel]").forEach((p) => (p.hidden = p.id !== `view-${view}`));
    if (view === "map") refreshMapView();
    if (view === "sightings") refreshSightingsView();
  }

  // ---------------- Data & sync tab --------------------------------------
  function wireDataView() {
    $("#export-btn").addEventListener("click", () => {
      Store.exportSightingsFile();
      $("#sync-status").textContent =
        "Downloaded sightings.json — move it into data/ in your repo, then commit and push.";
    });

    $("#import-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await Store.importSightingsFile(file);
        $("#sync-status").textContent = `Imported ${file.name}. Your local view now reflects that file.`;
        refreshTree();
        refreshHeadlineStats();
        if (selectedSpeciesId) selectSpecies(selectedSpeciesId);
      } catch (err) {
        $("#sync-status").textContent = `Couldn't import that file: ${err.message}`;
      }
    });

    $("#add-species-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      Store.addCustomSpecies({
        commonName: fd.get("commonName").trim(),
        class: fd.get("class"),
        order: fd.get("order").trim(),
        family: fd.get("family").trim(),
      });
      Store.exportCustomSpeciesFile();
      e.target.reset();
      refreshTree();
      refreshHeadlineStats();
      $("#sync-status").textContent =
        "Species added and custom-species.json downloaded — commit it to data/ to keep it permanently.";
    });

    $("#copy-status-btn").addEventListener("click", async () => {
      const text = buildClaudeSnapshot();
      const output = $("#claude-status-output");
      try {
        await navigator.clipboard.writeText(text);
        output.hidden = true;
        $("#sync-status").textContent = "Copied — paste it into your chat with Claude.";
      } catch (err) {
        output.hidden = false;
        output.value = text;
        output.select();
        $("#sync-status").textContent = "Couldn't copy automatically — select the text below and copy it manually.";
      }
    });

    $("#reset-btn").addEventListener("click", () => {
      if (confirm("Clear locally-saved sightings and custom species on this device? This can't be undone unless you've exported a backup.")) {
        Store.resetLocal();
        location.reload();
      }
    });
  }

  // ---------------- Wiring -------------------------------------------------
  async function init() {
    await Store.init();
    Taxonomy.expandDefaults(Store.allSpecies());
    refreshTree();
    refreshHeadlineStats();

    $$(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));

    $("#search-input").addEventListener("input", refreshTree);
    $("#seen-filter").addEventListener("change", refreshTree);
    $("#rarities-toggle").addEventListener("change", refreshTree);
    $("#county-filter").addEventListener("change", (e) => {
      activeCounty = e.target.value;
      refreshTree();
      refreshHeadlineStats();
      if (bigMapReady) YWMap.highlightCounty(activeCounty === "all" ? null : activeCounty);
    });

    $("#expand-all-btn").addEventListener("click", () => {
      Taxonomy.expandAll(getFilteredSpecies());
      refreshTree();
    });
    $("#collapse-all-btn").addEventListener("click", () => {
      Taxonomy.collapseAll();
      refreshTree();
    });

    $("#log-cancel-btn").addEventListener("click", closeLogModal);
    $("#log-modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "log-modal-overlay") closeLogModal();
    });

    $("#latlon-input").addEventListener("change", (e) => {
      const parsed = parseLatLonInput(e.target.value);
      if (parsed) {
        pickedLatLon = parsed;
        YWMap.setPickMarker(parsed[0], parsed[1]);
      }
    });

    $("#log-sighting-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const speciesId = fd.get("speciesId");
      const sighting = {
        speciesId,
        date: fd.get("date"),
        time: fd.get("time") || null,
        locationName: fd.get("locationName").trim(),
        county: fd.get("county"),
        note: fd.get("note").trim(),
        lat: pickedLatLon ? pickedLatLon[0] : null,
        lon: pickedLatLon ? pickedLatLon[1] : null,
      };
      Store.addSighting(sighting);
      closeLogModal();
      refreshTree();
      refreshHeadlineStats();
      selectSpecies(speciesId);
    });

    $("#map-species-select").addEventListener("change", refreshMapView);

    $("#map-place-search-btn").addEventListener("click", doBigMapPlaceSearch);
    $("#map-place-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doBigMapPlaceSearch();
      }
    });

    $("#pick-place-search-btn").addEventListener("click", doPickPlaceSearch);
    $("#pick-place-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doPickPlaceSearch();
      }
    });

    $("#sightings-search").addEventListener("input", refreshSightingsView);
    $("#sightings-sort").addEventListener("change", refreshSightingsView);

    wireDataView();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
