/* Worker entry point for myonlinehome.co.uk
 *
 * Static files in /public are matched first by the assets binding. Anything
 * that isn't a file — the API paths below — lands here. Anything this router
 * doesn't recognise is handed back to the asset binding so 404 handling and
 * directory index files behave normally.
 */

import {
  json,
  listSightings,
  listCustomSpecies,
  createSightings,
  deleteSighting,
  createCustomSpecies,
} from "./api.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    if (!path.startsWith("/api/") && !path.startsWith("/private/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      // ---- public reads ----
      if (path === "/api/sightings") {
        if (method === "GET") return listSightings(env);
        return json({ error: "Read-only. Write to /private/api/sightings." }, 405);
      }
      if (path === "/api/custom-species") {
        if (method === "GET") return listCustomSpecies(env);
        return json({ error: "Read-only. Write to /private/api/custom-species." }, 405);
      }

      // ---- writes, behind Cloudflare Access ----
      if (path === "/private/api/sightings") {
        if (method === "POST") return createSightings(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path.startsWith("/private/api/sightings/")) {
        const id = decodeURIComponent(path.slice("/private/api/sightings/".length));
        if (method === "DELETE") return deleteSighting(request, env, id);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/private/api/custom-species") {
        if (method === "POST") return createCustomSpecies(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }

      return json({ error: "No such endpoint", path }, 404);
    } catch (err) {
      console.error("API error", path, err);
      return json({ error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};
