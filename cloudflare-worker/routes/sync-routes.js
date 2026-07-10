export function createSyncRouteHandler(handler) {
  return (request, env, corsHeaders, pathname) => handler(request, env, corsHeaders, pathname);
}
