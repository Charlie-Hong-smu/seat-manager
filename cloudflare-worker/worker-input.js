export const MAX_BODY_BYTES = 20 * 1024;

export async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const clone = request.clone();
  const text = await clone.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false };
  }
}

// Preserve the legacy text/list conversion used by existing handlers.
export function toText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).slice(0, 8);
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        const text = toText(item);
        return text ? `${key}：${Array.isArray(text) ? text.join("；") : text}` : "";
      })
      .filter(Boolean)
      .slice(0, 8);
  }
  return String(value || "").trim().slice(0, 800);
}

// Strict output fields must not inherit the legacy recursive/list conversion.
export function toStringText(value, limit = 800) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, limit) : "";
}

export function toNullableNumber(value) {
  if (value === null || value === undefined || (typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
