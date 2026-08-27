/* store.js
 * Loads the checklist + seed sightings shipped in /data, layers on top of
 * whatever's in localStorage (the user's working copy on this device), and
 * exposes a small API for the rest of the app plus Export/Import to keep
 * data/sightings.json in the git repo as the durable source of truth.
 */
const Store = (() => {
  const LS_SIGHTINGS = "ywt.sightings.v1";
  const LS_CUSTOM_SPECIES = "ywt.customSpecies.v1";
  const LS_DISMISSED_SIGHTINGS = "ywt.dismissedSightings.v1";

  let species = [];       // built-in checklist (data/species.json)
  let customSpecies = []; // user-added species
  let sightings = [];     // all sightings
  let dismissedSightingIds = new Set(); // sighting ids you've deleted locally

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

  async function init() {
    const [builtIn, seedSightings, seedCustom] = await Promise.all([
      fetchJson("data/species.json", []),
      fetchJson("data/sightings.json", []),
      fetchJson("data/custom-species.json", []),
    ]);
    species = builtIn;

    dismissedSightingIds = new Set(loadLocal(LS_DISMISSED_SIGHTINGS, []));

    // localStorage is your working copy; the committed JSON files are the
    // shared copy -- which is also how Claude adds sightings or species you
    // tell it about in chat. Every load, anything new in the committed
    // files is merged into your local copy by id, so those updates just
    // show up here without needing a manual Import -- except a sighting
    // you've deleted locally, which stays deleted even if it's still
    // sitting in the committed file (tracked via LS_DISMISSED_SIGHTINGS).
    const localSightings = loadLocal(LS_SIGHTINGS, null);
    const localCustom = loadLocal(LS_CUSTOM_SPECIES, null);

    const seedSightingsLive = seedSightings.filter((s) => !dismissedSightingIds.has(s.id));
    sightings = mergeById(seedSightingsLive, localSightings || []);
    customSpecies = mergeById(seedCustom, localCustom || []);

    saveLocal(LS_SIGHTINGS, sightings);
    saveLocal(LS_CUSTOM_SPECIES, customSpecies);
  }

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

  function addSighting(sighting) {
    const record = {
      id: `sighting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      loggedAt: new Date().toISOString(),
      ...sighting,
    };
    sightings.push(record);
    saveLocal(LS_SIGHTINGS, sightings);
    return record;
  }

  function deleteSighting(id) {
    sightings = sightings.filter((s) => s.id !== id);
    dismissedSightingIds.add(id);
    saveLocal(LS_SIGHTINGS, sightings);
    saveLocal(LS_DISMISSED_SIGHTINGS, [...dismissedSightingIds]);
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
    return record;
  }

  function exportSightingsFile() {
    // Sort for clean, stable git diffs.
    const sorted = [...sightings].sort((a, b) => (a.date < b.date ? -1 : 1));
    const blob = new Blob([JSON.stringify(sorted, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sightings.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCustomSpeciesFile() {
    const blob = new Blob([JSON.stringify(customSpecies, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "custom-species.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importSightingsFile(file) {
    return file.text().then((text) => {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("File is not a sightings array");
      sightings = parsed;
      saveLocal(LS_SIGHTINGS, sightings);
    });
  }

  function resetLocal() {
    localStorage.removeItem(LS_SIGHTINGS);
    localStorage.removeItem(LS_CUSTOM_SPECIES);
    localStorage.removeItem(LS_DISMISSED_SIGHTINGS);
  }

  return {
    init,
    allSpecies,
    getSpecies,
    getSightings,
    allSightings,
    isSeen,
    seenCounties,
    addSighting,
    deleteSighting,
    addCustomSpecies,
    exportSightingsFile,
    exportCustomSpeciesFile,
    importSightingsFile,
    resetLocal,
  };
})();
