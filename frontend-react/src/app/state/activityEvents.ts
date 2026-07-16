import type { ActivityAction, ActivityEvent, BusinessDomain, BusinessEntityRef, StudentId } from "./types";

const DOMAINS = new Set<BusinessDomain>(["student", "attendance", "followup", "homework", "dormitory", "score", "communication", "fund", "seat", "draw", "schedule", "ai"]);
const ACTIONS = new Set<ActivityAction>(["created", "updated", "status_changed", "archived", "restored", "shared", "deleted"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeBusinessEntityRef(value: unknown): BusinessEntityRef | undefined {
  const item = record(value);
  if (!item || !DOMAINS.has(String(item.domain) as BusinessDomain) || typeof item.entityId !== "string" || !item.entityId) return undefined;
  return {
    domain: item.domain as BusinessDomain,
    entityId: item.entityId,
    subEntityId: typeof item.subEntityId === "string" && item.subEntityId ? item.subEntityId : undefined,
    studentId: typeof item.studentId === "string" && item.studentId ? item.studentId : undefined,
    date: typeof item.date === "string" && item.date ? item.date : undefined,
  };
}

export function normalizeActivityEvents(value: unknown): ActivityEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index): ActivityEvent[] => {
    const item = record(raw);
    const ref = normalizeBusinessEntityRef(item?.ref);
    if (!item || !ref || !ACTIONS.has(String(item.action) as ActivityAction)) return [];
    const occurredAt = typeof item.occurredAt === "string" && !Number.isNaN(new Date(item.occurredAt).getTime()) ? item.occurredAt : new Date().toISOString();
    return [{
      id: typeof item.id === "string" && item.id ? item.id : `activity-${index}`,
      action: item.action as ActivityAction,
      ref,
      studentIds: Array.isArray(item.studentIds) ? item.studentIds.filter((id): id is StudentId => typeof id === "string" && Boolean(id)) : [],
      title: typeof item.title === "string" ? item.title : "班级动态",
      detail: typeof item.detail === "string" ? item.detail : "",
      occurredAt,
    }];
  }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function createActivityEvent(input: Omit<ActivityEvent, "id" | "occurredAt"> & { occurredAt?: string }): ActivityEvent {
  const occurredAt = input.occurredAt || new Date().toISOString();
  return { ...input, id: `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, occurredAt };
}

export function prependActivity(events: ActivityEvent[], event: ActivityEvent): ActivityEvent[] {
  return [event, ...events].slice(0, 2000);
}
