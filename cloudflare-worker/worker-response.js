export function getCorsHeaders(origin, env) {
  const defaultAllowed = "https://charlie-hong-smu.github.io";
  const allowedList = String(env.ALLOWED_ORIGIN || defaultAllowed)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  const localhostAllowed = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowOrigin = allowedList.includes("*")
    ? origin || "*"
    : allowedList.includes(origin) || localhostAllowed
      ? origin
      : defaultAllowed;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

export function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}
