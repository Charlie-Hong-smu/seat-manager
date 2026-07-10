// Stable feature boundary for the application shell. Individual workspace
// implementations can move without changing App.tsx imports.
export {
  ClassFundWorkspace,
  DailyWorkspace,
  DataWorkspace,
  ScoresWorkspace,
} from "../WorkspacePages";
export { DormitoryWorkspace } from "../DormitoryWorkspace";
export { HistoryWorkspace } from "./HistoryWorkspace";
