import { useState } from "react";

import { AiCommentDrawer } from "./AiCommentDrawer";
import { StudentModal } from "./StudentModal";
import type { NewDormEventInput } from "../state/dormitoryActions";
import type { ActivityEvent, AppStudent, AttendanceRecord, BusinessEntityPreviewFallback, BusinessEntityPreviewModel, BusinessEntityRef, CommunicationDraft, Dormitory, FollowupTask, HomeworkAssignment, SeatLayoutV1, StudentId, StudentRecord } from "../state/types";

interface StudentDetailProps {
  student: AppStudent;
  elevated?: boolean;
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
  initialActiveTab?: "records" | "profile" | "trend" | "followup";
  onCreateFollowupTask?: (input: { studentId: StudentId; title: string; description: string }) => void;
  attendanceRecords?: AttendanceRecord[];
  followupTasks?: FollowupTask[];
  onAttendanceChange?: (records: AttendanceRecord[]) => void;
  homeworkAssignments?: HomeworkAssignment[];
  communicationDrafts?: CommunicationDraft[];
  activityEvents?: ActivityEvent[];
  onOpenEntity?: (ref: BusinessEntityRef) => void;
  resolveEntityPreview: (ref: BusinessEntityRef, fallback?: BusinessEntityPreviewFallback) => BusinessEntityPreviewModel;
}

export function StudentDetail({
  student,
  elevated = false,
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
  onCreateFollowupTask,
  attendanceRecords,
  followupTasks,
  onAttendanceChange,
  homeworkAssignments,
  communicationDrafts,
  activityEvents,
  onOpenEntity,
  resolveEntityPreview,
}: StudentDetailProps) {
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  return (
    <>
      <StudentModal
        key={student.id}
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
        onOpenAiComment={() => setAiDrawerOpen(true)}
        seatOrder={seatOrder}
        seatLayout={seatLayout}
        initialActiveTab={initialActiveTab}
        onCreateFollowupTask={onCreateFollowupTask}
        attendanceRecords={attendanceRecords}
        followupTasks={followupTasks}
        onAttendanceChange={onAttendanceChange}
        homeworkAssignments={homeworkAssignments}
        communicationDrafts={communicationDrafts}
        activityEvents={activityEvents}
        onOpenEntity={onOpenEntity}
        resolveEntityPreview={resolveEntityPreview}
        leavesWorkbench={elevated}
        layerClassName={elevated ? "z-[90]" : "z-[60]"}
      />
      <AiCommentDrawer
        open={aiDrawerOpen}
        student={student}
        onClose={() => setAiDrawerOpen(false)}
        elevated={elevated}
      />
    </>
  );
}
