const DEFAULT_WORKER_ORIGIN = "https://seat-manager-ai.hongchenglin03.workers.dev";

const ALLOWED_PATHS = [
  "/auth",
  "/analyze-class",
  "/analyze-trend",
  "/generate-comment",
  "/suggest-score-mapping",
  "/license/auth",
  "/license/unbind-device",
];

const ALLOWED_PREFIXES = [
  "/sync/",
];

function getWorkerOrigin() {
  return (Netlify.env.get("WORKER_ORIGIN") || DEFAULT_WORKER_ORIGIN).replace(/\/+$/, "");
}

function isAllowedPath(pathname) {
  return ALLOWED_PATHS.includes(pathname) || ALLOWED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function getCorsHeaders(req) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function getForwardHeaders(req) {
  const headers = new Headers(req.headers);
  [
    "host",
    "connection",
    "content-length",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
  ].forEach(name => headers.delete(name));
  return headers;
}

export default async (req, context) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const pathname = `/${context.params.path || ""}`;
  if (!isAllowedPath(pathname)) {
    return Response.json({ error: "proxy_path_not_allowed" }, { status: 404, headers: corsHeaders });
  }

  const incomingUrl = new URL(req.url);
  const targetUrl = new URL(`${getWorkerOrigin()}${pathname}`);
  targetUrl.search = incomingUrl.search;

  const body = req.method === "GET" || req.method === "HEAD"
    ? undefined
    : await req.arrayBuffer();

  const response = await fetch(targetUrl, {
    method: req.method,
    headers: getForwardHeaders(req),
    body,
    redirect: "manual",
  });

  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const config = {
  path: "/api/:path*",
};
