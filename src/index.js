/* Worker entry point for myonlinehome.co.uk
 *
 * Static files in /public are matched first by the assets binding. Anything
 * that isn't a file — the API paths below — lands here. Anything this router
 * doesn't recognise is handed back to the asset binding so 404 handling and
 * directory index files behave normally.
 *
 * The one exception is /admin/: wrangler.toml sends it here first
 * (run_worker_first), so its pages are only served to a signed-in browser and
 * everyone else is sent to /signin/. /admin/api/ mirrors every /private/api/
 * write, checked against that sign-in instead of Cloudflare Access.
 */

import {
  json,
  signedInRequests,
  listSightings,
  listCustomSpecies,
  createSightings,
  deleteSighting,
  createCustomSpecies,
  listRecipes,
  listDeletedRecipes,
  saveRecipes,
  deleteRecipe,
  listStorageRooms,
  createStorageRooms,
  deleteStorageRoom,
  listStorageReadings,
  createStorageReadings,
  deleteStorageReading,
} from "./api.js";
import { createContactMessage, listContactMessages, deleteContactMessage } from "./contact.js";
import { getInspiration } from "./inspiration.js";
import { isSignedIn, sameOrigin, signIn, signOut, sessionStatus } from "./auth.js";
import { listShopping, saveShopping, addShopping, getVoiceKey, replaceVoiceKey, voiceShopping, transcribeShopping } from "./shopping.js";
import { listGallery, galleryImage, uploadGalleryPhoto, removeGalleryPhoto, restoreGalleryPhoto } from "./gallery.js";
import { getBarStock, saveBarStock } from "./barstock.js";
import { getBins, findAddresses, saveAddress } from "./bins.js";

/* The old /private/ pages moved to /admin/ (and the site map to /sitemap/). */
const MOVED = {
  "/private": "/admin/",
  "/private/messages": "/admin/messages/",
  "/private/cookbook": "/admin/cookbook/",
  "/private/sitemap": "/sitemap/",
};

const signInRedirect = (url) =>
  Response.redirect(new URL("/signin/?next=" + encodeURIComponent(url.pathname + url.search), url).toString(), 302);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    if (MOVED[path]) return Response.redirect(new URL(MOVED[path], url).toString(), 301);

    // ---- the owner's area: pages ----
    if ((path === "/admin" || path.startsWith("/admin/")) && !path.startsWith("/admin/api/")) {
      if (!(await isSignedIn(request, env))) return signInRedirect(url);
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set("cache-control", "private, no-store");
      out.headers.set("x-robots-tag", "noindex");
      return out;
    }

    if (!path.startsWith("/api/") && !path.startsWith("/private/api/") && !path.startsWith("/admin/api/")) {
      return env.ASSETS.fetch(request);
    }

    // ---- the owner's area: writes ----
    // /admin/api/X is /private/api/X with the site's sign-in in place of Access.
    let apiPath = path;
    if (path.startsWith("/admin/api/")) {
      if (!(await isSignedIn(request, env))) return json({ error: "Not signed in", signIn: "/signin/" }, 401);
      if (method !== "GET" && !sameOrigin(request)) return json({ error: "Cross-site request refused" }, 403);
      signedInRequests.add(request);
      apiPath = "/private/api/" + path.slice("/admin/api/".length);
    }

    try {
      // ---- sign-in ----
      if (path === "/api/signin") {
        if (method === "POST") return signIn(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/api/signout") {
        if (method === "POST") return signOut(request);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/api/session") {
        if (method === "GET") return sessionStatus(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }

      // ---- gallery ----
      if (path === "/api/gallery") {
        if (method === "GET") return listGallery(env);
        return json({ error: "Read-only. Write to /admin/api/gallery." }, 405);
      }
      if (path.startsWith("/api/gallery/image/")) {
        const id = decodeURIComponent(path.slice("/api/gallery/image/".length));
        if (method === "GET") return galleryImage(env, id);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/admin/api/gallery") {
        if (method === "POST") return uploadGalleryPhoto(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path.startsWith("/admin/api/gallery/")) {
        const rest = path.slice("/admin/api/gallery/".length);
        if (rest.endsWith("/restore")) {
          const id = decodeURIComponent(rest.slice(0, -"/restore".length));
          if (method === "POST") return restoreGalleryPhoto(request, env, id);
          return json({ error: `${method} not allowed here` }, 405);
        }
        const id = decodeURIComponent(rest);
        if (method === "DELETE") return removeGalleryPhoto(request, env, id);
        return json({ error: `${method} not allowed here` }, 405);
      }

      // ---- shopping list: signed in, plus a key-only endpoint for voice shortcuts ----
      if (path === "/api/shopping/voice") {
        if (method === "POST" || method === "GET") return voiceShopping(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/admin/api/shopping") {
        if (method === "GET") return listShopping(request, env);
        if (method === "POST") return saveShopping(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/admin/api/shopping/add") {
        if (method === "POST") return addShopping(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/admin/api/shopping/transcribe") {
        if (method === "POST") return transcribeShopping(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/admin/api/shopping/key") {
        if (method === "GET") return getVoiceKey(request, env);
        if (method === "POST") return replaceVoiceKey(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }

      // ---- bin day (dashboard, signed in only) ----
      if (path === "/admin/api/bins") {
        if (method === "GET") return getBins(env, ctx);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/admin/api/bins/addresses") {
        if (method === "GET") return findAddresses(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/admin/api/bins/address") {
        if (method === "POST") return saveAddress(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }

      // ---- bar stock: public read (the guest cocktail menu), signed-in write ----
      if (path === "/api/bar-stock") {
        if (method === "GET") return getBarStock(env);
        return json({ error: "Read-only. Write to /admin/api/bar-stock." }, 405);
      }
      if (path === "/admin/api/bar-stock") {
        if (method === "GET") return getBarStock(env);
        if (method === "POST") return saveBarStock(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }

      // ---- public reads ----
      if (path === "/api/sightings") {
        if (method === "GET") return listSightings(env);
        return json({ error: "Read-only. Write to /admin/api/sightings." }, 405);
      }
      if (path === "/api/custom-species") {
        if (method === "GET") return listCustomSpecies(env);
        return json({ error: "Read-only. Write to /admin/api/custom-species." }, 405);
      }
      if (path === "/api/recipes") {
        if (method === "GET") return listRecipes(env);
        return json({ error: "Read-only. Write to /admin/api/recipes." }, 405);
      }
      if (path === "/api/recipes/deleted") {
        if (method === "GET") return listDeletedRecipes(env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/api/storage-rooms") {
        if (method === "GET") return listStorageRooms(env);
        return json({ error: "Read-only. Write to /admin/api/storage-rooms." }, 405);
      }
      if (path === "/api/inspiration") {
        if (method === "GET") return getInspiration(request, ctx);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/api/contact") {
        if (method === "POST") return createContactMessage(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (path === "/api/storage-readings") {
        if (method === "GET") return listStorageReadings(env);
        return json({ error: "Read-only. Write to /admin/api/storage-readings." }, 405);
      }

      // ---- writes, behind Cloudflare Access (/private/api/) or the sign-in (/admin/api/) ----
      if (apiPath === "/private/api/sightings") {
        if (method === "POST") return createSightings(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (apiPath.startsWith("/private/api/sightings/")) {
        const id = decodeURIComponent(apiPath.slice("/private/api/sightings/".length));
        if (method === "DELETE") return deleteSighting(request, env, id);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (apiPath === "/private/api/custom-species") {
        if (method === "POST") return createCustomSpecies(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (apiPath === "/private/api/recipes") {
        if (method === "POST") return saveRecipes(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (apiPath.startsWith("/private/api/recipes/")) {
        const id = decodeURIComponent(apiPath.slice("/private/api/recipes/".length));
        if (method === "DELETE") return deleteRecipe(request, env, id);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (apiPath === "/private/api/storage-rooms") {
        if (method === "POST") return createStorageRooms(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (apiPath.startsWith("/private/api/storage-rooms/")) {
        const id = decodeURIComponent(apiPath.slice("/private/api/storage-rooms/".length));
        if (method === "DELETE") return deleteStorageRoom(request, env, id);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (apiPath === "/private/api/storage-readings") {
        if (method === "POST") return createStorageReadings(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (apiPath.startsWith("/private/api/storage-readings/")) {
        const id = decodeURIComponent(apiPath.slice("/private/api/storage-readings/".length));
        if (method === "DELETE") return deleteStorageReading(request, env, id);
        return json({ error: `${method} not allowed here` }, 405);
      }

      if (apiPath === "/private/api/contact") {
        if (method === "GET") return listContactMessages(request, env);
        return json({ error: `${method} not allowed here` }, 405);
      }
      if (apiPath.startsWith("/private/api/contact/")) {
        const id = decodeURIComponent(apiPath.slice("/private/api/contact/".length));
        if (method === "DELETE") return deleteContactMessage(request, env, id);
        return json({ error: `${method} not allowed here` }, 405);
      }

      return json({ error: "No such endpoint", path }, 404);
    } catch (err) {
      console.error("API error", path, err);
      return json({ error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};
