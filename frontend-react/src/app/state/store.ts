import { useMemo } from "react";

import { createSeatManagerState } from "./legacyStateAdapter";
import { readLegacyRootState } from "./storage";
import type { SeatManagerState } from "./types";

export function useSeatManagerState(): SeatManagerState {
  return useMemo(() => createSeatManagerState(readLegacyRootState()), []);
}
