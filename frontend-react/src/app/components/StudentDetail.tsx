import type { SaveCommunication } from "./CommunicationEditor";
import type { ClassDutiesBinding } from "../state/classDuties";
import { StudentModal, type StudentDetailTab } from "./StudentModal";
import type { NewDormEventInput } from "../state/dormitoryActions";
import type { ActivityEvent, AppStudent, AttendanceRecord, BusinessEntityPreviewFallback, BusinessEntityPreviewModel, BusinessEntityRef, CommunicationDraft, Dormitory, FollowupTask, HomeworkAssignment, SeatLayoutV1, StudentId, StudentRecord } from "../state/types";

interface StudentDetailProps {
  classDuties?: ClassDutiesBinding;
  student: AppStudent;
  elevated?: boolean;
  leavesWorkbench?: boolean;
  students: AppStudent[];
  dormitories: Dormitory[];
  onClose: () => void;
  onUpdateStudent: (student: AppStudent) => void;
  onApplyRecord: (studentId: StudentId, record: StudentRecord, syncIds: StudentId[]) => void;
  onDeleteStudent: (studentId: StudentId) => void;
  onAssignDormitory: (studentId: StudentId, dormitoryId?: string) => void;
  onAddDormitoryEvent: (input: NewDormEventInput) => void;
  onOpenDormitories: () => void;
  seatOrder?: Array<StudentId | null>;
  seatLayout?: SeatLayoutV1;
  initialActiveTab?: StudentDetailTab;
  onActiveTabChange?: (tab: StudentDetailTab) => void;
  onNavigate?: (direction: -1 | 1) => void;
  onSelectStudent?: (studentId: StudentId) => void;
  navPosition?: { index: number; total: number };
  onCreateFollowupTask?: (input: { studentId: StudentId; title: string; description: string }) => void;
  attendanceRecords?: AttendanceRecord[];
  followupTasks?: FollowupTask[];
  onAttendanceChange?: (records: AttendanceRecord[]) => void;
  onActivity?: (event: ActivityEvent) => void | (() => void);
  homeworkAssignments?: HomeworkAssignment[];
  communicationDrafts?: CommunicationDraft[];
  onSaveCommunication?: SaveCommunication;
  activityEvents?: ActivityEvent[];
  onOpenEntity?: (ref: BusinessEntityRef) => void;
  resolveEntityPreview: (ref: BusinessEntityRef, fallback?: BusinessEntityPreviewFallback) => BusinessEntityPreviewModel;
}

export function StudentDetail({
  classDuties,
  student,
  elevated = false,
  leavesWorkbench = elevated,
  students,
  dormitories,
  onClose,
  onUpdateStudent,
  onApplyRecord,
  onDeleteStudent,
  onAssignDormitory,
  onAddDormitoryEvent,
  onOpenDormitories,
  seatOrder,
  seatLayout,
  initialActiveTab,
  onActiveTabChange,
  onNavigate,
  onSelectStudent,
  navPosition,
  onCreateFollowupTask,
  attendanceRecords,
  followupTasks,
  onAttendanceChange,
  onActivity,
  homeworkAssignments,
  communicationDrafts,
  onSaveCommunication,
  activityEvents,
  onOpenEntity,
  resolveEntityPreview,
}: StudentDetailProps) {
  return (
    <>
      <StudentModal
        classDuties={classDuties}
        student={student}
        students={students}
        dormitories={dormitories}
        onClose={onClose}
        onUpdateStudent={onUpdateStudent}
        onApplyRecord={onApplyRecord}
        onDeleteStudent={onDeleteStudent}
        onAssignDormitory={onAssignDormitory}
        onAddDormitoryEvent={onAddDormitoryEvent}
        onOpenDormitories={onOpenDormitories}
        seatOrder={seatOrder}
        seatLayout={seatLayout}
        initialActiveTab={initialActiveTab}
        onActiveTabChange={onActiveTabChange}
        onNavigate={onNavigate}
        onSelectStudent={onSelectStudent}
        navPosition={navPosition}
        onCreateFollowupTask={onCreateFollowupTask}
        attendanceRecords={attendanceRecords}
        followupTasks={followupTasks}
        onAttendanceChange={onAttendanceChange}
        onActivity={onActivity}
        homeworkAssignments={homeworkAssignments}
        communicationDrafts={communicationDrafts}
        onSaveCommunication={onSaveCommunication}
        activityEvents={activityEvents}
        onOpenEntity={onOpenEntity}
        resolveEntityPreview={resolveEntityPreview}
        leavesWorkbench={leavesWorkbench}
        layerClassName={elevated ? "z-[90]" : "z-[60]"}
      />
    </>
  );
}
