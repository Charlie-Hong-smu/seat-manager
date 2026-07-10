import { PRIVATE_ROUTE_PREFIXES, PUBLIC_POST_ROUTES, PUBLIC_ROUTE_PREFIXES } from "./worker-routes.js";
import { jsonResponse } from "./worker-response.js";

export async function dispatchWorkerRequest(request, env, corsHeaders, handlers) {
  const url = new URL(request.url);
  if (PRIVATE_ROUTE_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) {
    return handlers.licenseAdmin(request, env, corsHeaders, url.pathname);
  }
  if (PUBLIC_ROUTE_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) {
    return handlers.sync(request, env, corsHeaders, url.pathname);
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
  }
  if (!PUBLIC_POST_ROUTES.includes(url.pathname)) {
    return jsonResponse({ error: "not_found" }, 404, corsHeaders);
  }
  const handler = handlers.post[url.pathname];
  return handler
    ? handler(request, env, corsHeaders)
    : jsonResponse({ error: "not_found" }, 404, corsHeaders);
}
