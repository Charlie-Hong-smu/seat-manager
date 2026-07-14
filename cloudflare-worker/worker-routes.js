export const PUBLIC_POST_ROUTES = Object.freeze([
  "/license/auth",
  "/license/unbind-device",
  "/auth",
  "/analyze-trend",
  "/analyze-class",
  "/chat-assistant",
  "/student-followup",
  "/generate-comment",
  "/suggest-score-mapping",
  "/suggest-roster-mapping",
  "/generate-weekly-draft",
  "/analyze-score-items",
]);

export const PUBLIC_ROUTE_PREFIXES = Object.freeze(["/sync/"]);
export const PRIVATE_ROUTE_PREFIXES = Object.freeze(["/admin/licenses/"]);

export function isPublicProxyRoute(pathname) {
  return PUBLIC_POST_ROUTES.includes(pathname)
    || PUBLIC_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix));
}
