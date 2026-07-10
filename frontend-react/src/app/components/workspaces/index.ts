// Stable feature boundary for the application shell. Individual workspace
// implementations can move without changing App.tsx imports.
export {
  ClassFundWorkspace,
  DailyWorkspace,
  DataWorkspace,
  HistoryWorkspace,
  ScoresWorkspace,
} from "../WorkspacePages";
export { DormitoryWorkspace } from "../DormitoryWorkspace";
