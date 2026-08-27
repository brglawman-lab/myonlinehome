/* store.js — data layer for the Yorkshire Wildlife Tracker.
 *
 * Offline-first. The database (Cloudflare D1, reached through /api/…) is the
 * source of truth, but everything is mirrored into localStorage so the app
 * still works with no signal — which is the normal case standing on a cliff
 * at Bempton. Writes go into a queue and are flushed when the network and an
 * Access session are both available.
 *
 *   read   GET  /api/sightings              public
 *   read   GET  /api/custom-species         public
 *   write  POST /private/api/sightings      behind Cloudflare Access
 *   write  DEL  /private/api/sightings/:id  behind Cloudflare Access
 *
 * The built-in 468-species checklist stays a static file — it is reference
 * data that never changes at runtime, so there is no reason to pay for a
 * database round trip.
 */
const Store = (() => {
  const LS_SIGHTINGS = "ywt.sightings.v1";
  const LS_CUSTOM_SPECIES = "ywt.customSpecies.v1";
  const LS_DISMISSED_SIGHTINGS = "ywt.dismissedSightings.v1";
  const LS_QUEUE = "ywt.pendingWrites.v1";

  const API_READ_SIGHTINGS = "/api/sightings";
  const API_READ_CUSTOM = "/api/custom-species";
  const API_WRITE_SIGHTINGS = "/private/api/sightings";
  const API_WRITE_CUSTOM = "/private/api/custom-species";

  let species = [];
  let customSpecies = [];
  let sightings = [];
  let dismissedSightingIds = new Set();

  // queue = { creates: [sighting], deletes: [id], customs: [species] }
  let queue = { creates: [], deletes: [], customs: [] };
  let status = { online: false, pending: 0, needsSignIn: false, lastError: null };

  /* ---------- storage helpers ---------- */

  function loadLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn(`Could not read localStorage ${key}`, e);
      return fallback;
    }
  }

  function saveLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`Could not write localStorage ${key}`, e);
    }
  }

  function mergeById(base, extra) {
    const map = new Map(base.map((s) => [s.id, s]));
    for (const s of extra) map.set(s.id, s);
    return [...map.values()];
  }

  async function fetchJson(path, fallback) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (e) {
      console.warn(`Could not load ${path}, using fallback.`, e);
      return fallback;
    }
  }

  /* ---------- sync ---------- */

  function saveQueue() {
    saveLocal(LS_QUEUE, queue);
    status.pending = queue.creates.length + queue.deletes.length + queue.customs.length;
    renderStatus();
  }

  /* A write endpoint sitting behind Cloudflare Access answers an
   * unauthenticated request with a redirect to the login page rather than
   * JSON. Detect that and say so, instead of silently dropping the write. */
  async function postJson(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const type = res.headers.get("content-type") || "";
    if (res.status === 401 || !type.includes("application/json")) {
      const err = new Error("Not signed in");
      err.needsSignIn = true;
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function flushQueue() {
    if (!navigator.onLine) {
      status.online = false;
      renderStatus();
      return;
    }
    if (queue.creates.length === 0 && queue.deletes.length === 0 && queue.customs.length === 0) {
      status.needsSignIn = false;
      status.lastError = null;
      renderStatus();
      return;
    }

    try {
      if (queue.creates.length) {
        await postJson(API_WRITE_SIGHTINGS, queue.creates);
        queue.creates = [];
      }
      if (queue.customs.length) {
        await postJson(API_WRITE_CUSTOM, queue.customs);
        queue.customs = [];
      }
      for (const id of [...queue.deletes]) {
        const res = await fetch(`${API_WRITE_SIGHTINGS}/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const type = res.headers.get("content-type") || "";
        if (res.status === 401 || !type.includes("application/json")) {
          const err = new Error("Not signed in");
          err.needsSignIn = true;
          throw err;
        }
        queue.deletes = queue.deletes.filter((d) => d !== id);
      }
      status.needsSignIn = false;
      status.lastError = null;
    } catch (e) {
      // A cross-origin redirect to the Access login page surfaces as a
      // TypeError, not a response we can read. If we are online and a write
      // failed at the network level, the cause is almost always a missing
      // Access session.
      const networkLevel = e instanceof TypeError;
      status.needsSignIn = Boolean(e.needsSignIn) || (navigator.onLine && networkLevel);
      status.lastError = e.message;
      console.warn("Sync failed, keeping changes queued.", e);
    }
    saveQueue();
  }

  /* ---------- status pill ---------- */

  function renderStatus() {
    let el = document.getElementById("ywt-sync-status");
    const show = status.pending > 0 || status.needsSignIn || (!status.online && status.pending > 0);

    if (!show) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "ywt-sync-status";
      el.style.cssText =
        "position:fixed;bottom:14px;right:14px;z-index:99999;max-width:280px;" +
        "padding:9px 14px;border-radius:10px;background:rgba(250,248,244,0.97);" +
        "border:1px solid rgba(45,74,62,0.22);box-shadow:0 3px 14px rgba(0,0,0,0.14);" +
        "font:400 13px/1.4 'DM Sans',-apple-system,sans-serif;color:#2a2a2a";
      document.body.appendChild(el);
    }

    const n = status.pending;
    const plural = n === 1 ? "change" : "changes";
    if (status.needsSignIn) {
      el.innerHTML =
        `<strong style="color:#c4622d">${n} ${plural} saved on this device</strong><br>` +
        `<a href="/private/" style="color:#2d4a3e" target="_blank" rel="noopener">Sign in</a>` +
        ` to sync ${n === 1 ? "it" : "them"} to the database.`;
    } else if (!navigator.onLine) {
      el.innerHTML = `<strong>Offline</strong><br>${n} ${plural} will sync when you're back online.`;
    } else {
      el.innerHTML = `Syncing ${n} ${plural}…`;
    }
  }

  /* ---------- init ---------- */

  async function init() {
    const builtIn = await fetchJson("data/species.json", []);
    species = builtIn;

    dismissedSightingIds = new Set(loadLocal(LS_DISMISSED_SIGHTINGS, []));
    queue = loadLocal(LS_QUEUE, { creates: [], deletes: [], customs: [] });
    queue.creates ||= [];
    queue.deletes ||= [];
    queue.customs ||= [];

    const cachedSightings = loadLocal(LS_SIGHTINGS, []) || [];
    const cachedCustom = loadLocal(LS_CUSTOM_SPECIES, []) || [];

    // Try the database first; fall back to the cache, then to the committed
    // seed files (which is how this worked before the database existed).
    let serverSightings = null;
    let serverCustom = null;
    try {
      const [a, b] = await Promise.all([
        fetch(API_READ_SIGHTINGS, { cache: "no-store" }),
        fetch(API_READ_CUSTOM, { cache: "no-store" }),
      ]);
      if (a.ok) {
        const j = await a.json();
        if (Array.isArray(j)) serverSightings = j;
      }
      if (b.ok) {
        const j = await b.json();
        if (Array.isArray(j)) serverCustom = j;
      }
    } catch (e) {
      console.warn("Database unreachable, working from the local cache.", e);
    }

    status.online = serverSightings !== null;

    if (serverSightings !== null) {
      // Server wins, then anything still queued locally is layered on top so
      // an unsynced sighting doesn't vanish from the list.
      sightings = mergeById(
        serverSightings.filter((s) => !dismissedSightingIds.has(s.id)),
        queue.creates
      );
      customSpecies = mergeById(serverCustom || [], queue.customs);
    } else {
      const seedSightings = await fetchJson("data/sightings.json", []);
      const seedCustom = await fetchJson("data/custom-species.json", []);
      sightings = mergeById(
        seedSightings.filter((s) => !dismissedSightingIds.has(s.id)),
        cachedSightings
      );
      customSpecies = mergeById(seedCustom, cachedCustom);
    }

    sightings = sightings.filter((s) => !queue.deletes.includes(s.id));

    saveLocal(LS_SIGHTINGS, sightings);
    saveLocal(LS_CUSTOM_SPECIES, customSpecies);
    status.pending = queue.creates.length + queue.deletes.length + queue.customs.length;

    flushQueue();
    window.addEventListener("online", flushQueue);
    window.addEventListener("offline", renderStatus);
  }

  /* ---------- reads ---------- */

  function allSpecies() {
    return mergeById(species, customSpecies);
  }

  function getSpecies(id) {
    return allSpecies().find((s) => s.id === id);
  }

  function getSightings(speciesId) {
    return sightings
      .filter((s) => s.speciesId === speciesId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function allSightings() {
    return sightings;
  }

  function isSeen(speciesId) {
    return sightings.some((s) => s.speciesId === speciesId);
  }

  function seenCounties(speciesId) {
    return [...new Set(sightings.filter((s) => s.speciesId === speciesId).map((s) => s.county))];
  }

  function syncStatus() {
    return { ...status };
  }

  /* ---------- writes ---------- */

  function addSighting(sighting) {
    const record = {
      id: `sighting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      loggedAt: new Date().toISOString(),
      ...sighting,
    };
    sightings.push(record);
    saveLocal(LS_SIGHTINGS, sightings);
    queue.creates.push(record);
    saveQueue();
    flushQueue();
    return record;
  }

  function deleteSighting(id) {
    sightings = sightings.filter((s) => s.id !== id);
    dismissedSightingIds.add(id);
    saveLocal(LS_SIGHTINGS, sightings);
    saveLocal(LS_DISMISSED_SIGHTINGS, [...dismissedSightingIds]);

    // If it was never synced, just drop it from the queue instead of asking
    // the server to delete a row that does not exist.
    const wasPending = queue.creates.some((s) => s.id === id);
    queue.creates = queue.creates.filter((s) => s.id !== id);
    if (!wasPending) queue.deletes.push(id);
    saveQueue();
    flushQueue();
  }

  function addCustomSpecies({ commonName, class: cls, order, family }) {
    const slug = (s) =>
      s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const id = `${slug(cls)}-${slug(commonName)}-custom`;
    const record = {
      id,
      commonName,
      class: cls,
      order,
      family,
      occurrenceStatus: "resident",
      conservationStatus: null,
      custom: true,
    };
    customSpecies.push(record);
    saveLocal(LS_CUSTOM_SPECIES, customSpecies);
    queue.customs.push(record);
    saveQueue();
    flushQueue();
    return record;
  }

  /* ---------- export / import (kept as a manual backup route) ---------- */

  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportSightingsFile() {
    download("sightings.json", [...sightings].sort((a, b) => (a.date < b.date ? -1 : 1)));
  }

  function exportCustomSpeciesFile() {
    download("custom-species.json", customSpecies);
  }

  function importSightingsFile(file) {
    return file.text().then((text) => {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("File is not a sightings array");
      sightings = parsed;
      saveLocal(LS_SIGHTINGS, sightings);
      // Push the imported set up to the database too, so an import from an old
      // export doesn't stay stranded on one device.
      queue.creates = mergeById(queue.creates, parsed);
      saveQueue();
      flushQueue();
    });
  }

  function resetLocal() {
    localStorage.removeItem(LS_SIGHTINGS);
    localStorage.removeItem(LS_CUSTOM_SPECIES);
    localStorage.removeItem(LS_DISMISSED_SIGHTINGS);
    localStorage.removeItem(LS_QUEUE);
  }

  return {
    init,
    allSpecies,
    getSpecies,
    getSightings,
    allSightings,
    isSeen,
    seenCounties,
    syncStatus,
    flushQueue,
    addSighting,
    deleteSighting,
    addCustomSpecies,
    exportSightingsFile,
    exportCustomSpeciesFile,
    importSightingsFile,
    resetLocal,
  };
})();
