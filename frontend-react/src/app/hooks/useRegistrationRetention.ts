import { useState } from "react";
import { getCurrentWorkspaceScope } from "../state/workspaces";
import { cacheGenerationSuffix } from "../state/workspaceSyncEvents";
import type { StudentId } from "../state/types";

/** Keep a just-edited student in place until the teacher changes the roster query.
 * This prevents a second tap from hitting the next student as a filter updates. */
export function useRegistrationRetention(query: string) {
  const scope = `${getCurrentWorkspaceScope()}:${cacheGenerationSuffix()}:${query}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; ids: Set<StudentId> }>({ scope, ids: new Set() });
  const retainedIds = snapshot.scope === scope ? snapshot.ids : new Set<StudentId>();
  return {
    retainedIds,
    retainStudent: (id: StudentId) => setSnapshot(previous => ({ scope, ids: new Set(previous.scope === scope ? previous.ids : []).add(id) })),
    clearRetention: () => setSnapshot({ scope, ids: new Set() }),
  };
}
