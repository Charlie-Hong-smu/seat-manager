import { useState } from "react";

import { AiCommentDrawer } from "./AiCommentDrawer";
import { StudentModal } from "./StudentModal";
import type { NewDormEventInput } from "../state/dormitoryActions";
import type { ActivityEvent, AppStudent, AttendanceRecord, BusinessEntityRef, CommunicationDraft, Dormitory, FollowupTask, HomeworkAssignment, SeatLayoutV1, StudentId, StudentRecord } from "../state/types";

interface StudentDetailProps {
  student: AppStudent;
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
  onCommunicationDraftsChange?: (drafts: CommunicationDraft[]) => void;
  onActivity?: (event: ActivityEvent) => void;
  activityEvents?: ActivityEvent[];
  onOpenEntity?: (ref: BusinessEntityRef) => void;
}

export function StudentDetail({
  student,
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
  onCommunicationDraftsChange,
  onActivity,
  activityEvents,
  onOpenEntity,
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
        onCommunicationDraftsChange={onCommunicationDraftsChange}
        onActivity={onActivity}
        activityEvents={activityEvents}
        onOpenEntity={onOpenEntity}
      />
      <AiCommentDrawer
        open={aiDrawerOpen}
        student={student}
        onClose={() => setAiDrawerOpen(false)}
      />
    </>
  );
}
