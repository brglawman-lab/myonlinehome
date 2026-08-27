/* map.js
 * Leaflet maps: the big "Map" tab (county shading + sightings + live NBN
 * Atlas occurrence data when reachable), a small read-only map on a
 * species' detail card, and a click-to-pick mini-map in the log form.
 *
 * NBN Atlas note: the site queries https://records-ws.nbnatlas.org directly
 * from the browser. That's the officially documented public web service,
 * but this project could not confirm from a sandboxed build environment
 * whether it sends CORS headers for arbitrary origins. The fetch is
 * wrapped so that if it's blocked, throttled, or just returns nothing, the
 * UI falls back cleanly to an outbound link to the NBN Atlas website
 * instead of failing silently.
 */
const YWMap = (() => {
  const YORKSHIRE_CENTER = [54.02, -1.4];
  const COUNTY_COLORS = {
    "West Yorkshire": "#2f6b4f",
    "South Yorkshire": "#a1552e",
    "East Riding of Yorkshire": "#3a5ba0",
    "North Yorkshire": "#7a4e9e",
  };
  const NBN_TIMEOUT_MS = 7000;
  const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
  // Rough Yorkshire bounding box (left,top,right,bottom) used to bias --
  // not restrict -- place search results, so "Whitby" beats a same-named
  // place elsewhere without hiding genuinely out-of-area results.
  const YORKSHIRE_VIEWBOX = "-2.6,54.65,0.2,53.3";

  let countiesGeoJson = null;
  let bigMap, bigMapCountyLayer, bigMapMarkers = [], bigMapSearchMarker = null;
  let onCountyClick = () => {};

  // Leaflet popups render their content as HTML, so anything built from
  // user-entered text (a sighting's location name, a custom species name)
  // must be escaped before going into a popup string.
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  async function loadCounties() {
    if (countiesGeoJson) return countiesGeoJson;
    const res = await fetch("data/counties.geojson", { cache: "no-store" });
    countiesGeoJson = await res.json();
    return countiesGeoJson;
  }

  function tileLayer() {
    return L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    });
  }

  function countyStyle(name, highlighted) {
    const color = COUNTY_COLORS[name] || "#666";
    return {
      color,
      weight: highlighted ? 3 : 1.4,
      fillColor: color,
      fillOpacity: highlighted ? 0.28 : 0.12,
    };
  }

  async function initBigMap(handlers = {}) {
    onCountyClick = handlers.onCountyClick || (() => {});
    bigMap = L.map("big-map", { scrollWheelZoom: true }).setView(YORKSHIRE_CENTER, 8);
    tileLayer().addTo(bigMap);

    const geo = await loadCounties();
    bigMapCountyLayer = L.geoJSON(geo, {
      style: (f) => countyStyle(f.properties.name, false),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(feature.properties.name, { sticky: true });
        layer.on("click", () => onCountyClick(feature.properties.name));
      },
    }).addTo(bigMap);

    return bigMap;
  }

  function highlightCounty(name) {
    if (!bigMapCountyLayer) return;
    bigMapCountyLayer.eachLayer((layer) => {
      layer.setStyle(countyStyle(layer.feature.properties.name, layer.feature.properties.name === name));
    });
  }

  function clearBigMapMarkers() {
    bigMapMarkers.forEach((m) => bigMap.removeLayer(m));
    bigMapMarkers = [];
  }

  function addMarker(lat, lon, opts = {}) {
    const marker = L.circleMarker([lat, lon], {
      radius: opts.radius || 6,
      color: opts.color || "#204b38",
      fillColor: opts.fillColor || opts.color || "#2f6b4f",
      fillOpacity: opts.fillOpacity ?? 0.85,
      weight: 2,
    });
    if (opts.popup) marker.bindPopup(opts.popup);
    marker.addTo(bigMap);
    bigMapMarkers.push(marker);
    return marker;
  }

  function plotSightings(sightings) {
    clearBigMapMarkers();
    const withCoords = sightings.filter((s) => s.lat && s.lon);
    for (const s of withCoords) {
      addMarker(s.lat, s.lon, {
        color: "#204b38",
        popup: `<strong>${escapeHtml(s.speciesName || "")}</strong><br>${escapeHtml(s.locationName)}<br>${escapeHtml(s.date)}`,
      });
    }
    return withCoords;
  }

  async function fetchNbnOccurrences(commonName, scientificName) {
    const q = scientificName ? `taxon_name:"${scientificName}"` : `"${commonName}"`;
    const url = `https://records-ws.nbnatlas.org/occurrences/search?q=${encodeURIComponent(q)}` +
      `&fq=-occurrence_status:"absent"&pageSize=300`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), NBN_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`NBN responded ${res.status}`);
      const data = await res.json();
      const occ = (data.occurrences || []).filter((o) => o.decimalLatitude && o.decimalLongitude);
      // Loose Yorkshire bounding box so a global species search doesn't
      // paint markers from the whole country onto a Yorkshire-only map.
      return occ.filter(
        (o) => o.decimalLatitude > 53.3 && o.decimalLatitude < 54.65 &&
               o.decimalLongitude > -2.6 && o.decimalLongitude < 0.2
      );
    } catch (e) {
      clearTimeout(t);
      console.warn("NBN Atlas fetch failed or was blocked:", e);
      return null; // null = couldn't reach it; [] = reached it, no records
    }
  }

  function nbnLinkFor(commonName) {
    return `https://records.nbnatlas.org/occurrences/search?q=${encodeURIComponent(commonName)}`;
  }

  // --- Place name search (OpenStreetMap Nominatim, no API key needed) ---
  async function geocodePlace(query) {
    const url = `${NOMINATIM_URL}?format=jsonv2&q=${encodeURIComponent(query)}` +
      `&countrycodes=gb&viewbox=${YORKSHIRE_VIEWBOX}&limit=1`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`search request failed (${res.status})`);
    const results = await res.json();
    return results[0] || null;
  }

  async function searchBigMapPlace(query) {
    const hit = await geocodePlace(query);
    if (!hit || !bigMap) return null;
    const lat = parseFloat(hit.lat), lon = parseFloat(hit.lon);
    if (bigMapSearchMarker) bigMap.removeLayer(bigMapSearchMarker);
    bigMapSearchMarker = L.marker([lat, lon]).addTo(bigMap).bindPopup(escapeHtml(hit.display_name)).openPopup();
    bigMap.setView([lat, lon], 12);
    return hit;
  }

  async function searchPickMapPlace(query) {
    const hit = await geocodePlace(query);
    if (!hit) return null;
    const lat = parseFloat(hit.lat), lon = parseFloat(hit.lon);
    setPickMarker(lat, lon);
    pickOnPick(lat, lon);
    return hit;
  }

  async function showSpecies(species, mySightings) {
    clearBigMapMarkers();
    const hint = document.getElementById("map-hint");
    const mine = plotSightings(mySightings.map((s) => ({ ...s, speciesName: species?.commonName })));

    if (!species) {
      hint.innerHTML = mine.length
        ? `Showing all ${mine.length} of your logged sightings.`
        : `Log a sighting to see it here, or pick a species to check where it's been recorded.`;
      return;
    }

    hint.textContent = "Checking NBN Atlas for live occurrence data…";
    const nbn = await fetchNbnOccurrences(species.commonName, species.scientificName);

    if (nbn === null) {
      hint.innerHTML = `Live NBN Atlas data isn't reachable from this browser right now &mdash; ` +
        `<a href="${nbnLinkFor(species.commonName)}" target="_blank" rel="noopener">view ${species.commonName} records on NBN Atlas</a> instead. ` +
        `${mine.length} of your own sightings shown.`;
      return;
    }

    for (const o of nbn) {
      addMarker(o.decimalLatitude, o.decimalLongitude, {
        radius: 4,
        color: "#8a8a8a",
        fillOpacity: 0.5,
        popup: `NBN record${o.eventDate ? ": " + o.eventDate : ""}`,
      });
    }
    hint.innerHTML = `${nbn.length} NBN Atlas record${nbn.length === 1 ? "" : "s"} in Yorkshire (grey) ` +
      `and ${mine.length} of your own sightings (green). ` +
      `<a href="${nbnLinkFor(species.commonName)}" target="_blank" rel="noopener">See full records on NBN Atlas</a>.`;
  }

  // --- Small read-only map for a species detail card -----------------
  let detailMap = null;
  async function renderDetailMap(elId, sightings) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (detailMap) {
      detailMap.remove();
      detailMap = null;
    }
    el.innerHTML = "";
    const withCoords = sightings.filter((s) => s.lat && s.lon);
    detailMap = L.map(elId, { scrollWheelZoom: false }).setView(YORKSHIRE_CENTER, 8);
    tileLayer().addTo(detailMap);
    const geo = await loadCounties();
    L.geoJSON(geo, { style: (f) => countyStyle(f.properties.name, false) }).addTo(detailMap);
    if (withCoords.length) {
      const group = L.featureGroup(
        withCoords.map((s) =>
          L.circleMarker([s.lat, s.lon], { radius: 6, color: "#204b38", fillColor: "#2f6b4f", fillOpacity: 0.85 })
            .bindPopup(`${escapeHtml(s.locationName)}<br>${escapeHtml(s.date)}`)
        )
      ).addTo(detailMap);
      detailMap.fitBounds(group.getBounds().pad(0.5));
    }
  }

  // --- Click-to-pick mini map for the log form ------------------------
  let pickMap = null, pickMarker = null, pickOnPick = () => {};
  async function initPickMap(elId, onPick, initial) {
    pickOnPick = onPick;
    const el = document.getElementById(elId);
    if (pickMap) {
      pickMap.remove();
      pickMap = null;
    }
    el.innerHTML = "";
    pickMap = L.map(elId, { scrollWheelZoom: false }).setView(initial || YORKSHIRE_CENTER, initial ? 11 : 8);
    tileLayer().addTo(pickMap);
    const geo = await loadCounties();
    L.geoJSON(geo, { style: (f) => countyStyle(f.properties.name, false) }).addTo(pickMap);
    if (initial) {
      pickMarker = L.marker(initial).addTo(pickMap);
    }
    pickMap.on("click", (e) => {
      const { lat, lng } = e.latlng;
      if (pickMarker) pickMap.removeLayer(pickMarker);
      pickMarker = L.marker([lat, lng]).addTo(pickMap);
      onPick(lat, lng);
    });
  }

  function setPickMarker(lat, lon) {
    if (!pickMap) return;
    if (pickMarker) pickMap.removeLayer(pickMarker);
    pickMarker = L.marker([lat, lon]).addTo(pickMap);
    pickMap.setView([lat, lon], 11);
  }

  return {
    initBigMap,
    highlightCounty,
    showSpecies,
    renderDetailMap,
    initPickMap,
    setPickMarker,
    loadCounties,
    searchBigMapPlace,
    searchPickMapPlace,
  };
})();
