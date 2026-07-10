import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

import { createSeatManagerState } from "./legacyStateAdapter";
import { saveLegacySnapshot } from "./legacyWriteAdapter";
import { readLegacyRootState } from "./storage";
import type { AppStudent, Dormitory, FundTransaction, SeatHistorySnapshot, SeatManagerState, SeatSettings, StudentId } from "./types";

type FieldUpdater<T> = SetStateAction<T>;

function resolveUpdate<T>(current: T, update: FieldUpdater<T>): T {
  return typeof update === "function" ? (update as (value: T) => T)(current) : update;
}

export interface SeatManagerController {
  state: SeatManagerState;
  replace(next: SeatManagerState): void;
  reload(): SeatManagerState;
  persist(): boolean;
  setStudents: Dispatch<SetStateAction<AppStudent[]>>;
  setDormitories: Dispatch<SetStateAction<Dormitory[]>>;
  setFundTransactions: Dispatch<SetStateAction<FundTransaction[]>>;
  setSeatOrder: Dispatch<SetStateAction<Array<StudentId | null>>>;
  setLockedSeats: Dispatch<SetStateAction<Set<number>>>;
  setSeatSettings: Dispatch<SetStateAction<SeatSettings>>;
  setSeatHistory: Dispatch<SetStateAction<SeatHistorySnapshot[]>>;
}

export function useSeatManagerController(initialState: SeatManagerState): SeatManagerController {
  const [state, setState] = useState(initialState);

  const replace = useCallback((next: SeatManagerState) => setState(next), []);
  const reload = useCallback(() => {
    const next = createSeatManagerState(readLegacyRootState());
    setState(next);
    return next;
  }, []);

  const persist = useCallback(() => saveLegacySnapshot({
    students: state.students,
    seatOrder: state.seatOrder,
    lockedSeats: state.lockedSeats,
    seatSettings: state.seatSettings,
    dormitories: state.dormitories,
    seatHistory: state.seatHistory,
    fundTransactions: state.fundTransactions,
  }), [state]);

  const setStudents = useCallback<SeatManagerController["setStudents"]>(update => {
    setState(current => ({ ...current, students: resolveUpdate(current.students, update) }));
  }, []);
  const setDormitories = useCallback<SeatManagerController["setDormitories"]>(update => {
    setState(current => ({ ...current, dormitories: resolveUpdate(current.dormitories, update) }));
  }, []);
  const setFundTransactions = useCallback<SeatManagerController["setFundTransactions"]>(update => {
    setState(current => ({ ...current, fundTransactions: resolveUpdate(current.fundTransactions, update) }));
  }, []);
  const setSeatOrder = useCallback<SeatManagerController["setSeatOrder"]>(update => {
    setState(current => ({ ...current, seatOrder: resolveUpdate(current.seatOrder, update) }));
  }, []);
  const setLockedSeats = useCallback<SeatManagerController["setLockedSeats"]>(update => {
    setState(current => {
      const next = resolveUpdate(new Set(current.lockedSeats), update);
      return { ...current, lockedSeats: [...next] };
    });
  }, []);
  const setSeatSettings = useCallback<SeatManagerController["setSeatSettings"]>(update => {
    setState(current => ({ ...current, seatSettings: resolveUpdate(current.seatSettings, update) }));
  }, []);
  const setSeatHistory = useCallback<SeatManagerController["setSeatHistory"]>(update => {
    setState(current => ({ ...current, seatHistory: resolveUpdate(current.seatHistory, update) }));
  }, []);

  return { state, replace, reload, persist, setStudents, setDormitories, setFundTransactions, setSeatOrder, setLockedSeats, setSeatSettings, setSeatHistory };
}
