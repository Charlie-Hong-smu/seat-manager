import { dispatchWorkerRequest } from "./worker-router.js";
import { getCorsHeaders, jsonResponse } from "./worker-response.js";
import { licensePostRoutes } from "./routes/license-routes.js";
import { handleLicenseAdminRoute } from "./routes/license-admin-routes.js";
import { aiPostRoutes } from "./routes/ai-routes.js";
import { handleSyncRoute } from "./routes/sync-routes.js";

// Route definitions are immutable configuration; request state stays in each handler.
const handlers = {
  licenseAdmin: handleLicenseAdminRoute,
  sync: handleSyncRoute,
  post: { ...licensePostRoutes, ...aiPostRoutes },
};

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request.headers.get("Origin") || "", env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    try {
      return await dispatchWorkerRequest(request, env, corsHeaders, handlers);
    } catch (error) {
      console.error(JSON.stringify({ event: "worker_request_failed", message: error instanceof Error ? error.message : "unknown_error" }));
      return jsonResponse({ error: "internal_error" }, 500, corsHeaders);
    }
  },
};
