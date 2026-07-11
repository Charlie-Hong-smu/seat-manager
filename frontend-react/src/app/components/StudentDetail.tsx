import { useState } from "react";

import { AiCommentDrawer } from "./AiCommentDrawer";
import { StudentModal } from "./StudentModal";
import type { NewDormEventInput } from "../state/dormitoryActions";
import type { AppStudent, AttendanceRecord, Dormitory, FollowupTask, StudentId, StudentRecord } from "../state/types";

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
  initialActiveTab?: "records" | "profile" | "trend" | "followup";
  onCreateFollowupTask?: (input: { studentId: StudentId; title: string; description: string }) => void;
  attendanceRecords?: AttendanceRecord[];
  followupTasks?: FollowupTask[];
  onAttendanceChange?: (records: AttendanceRecord[]) => void;
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
  initialActiveTab,
  onCreateFollowupTask,
  attendanceRecords,
  followupTasks,
  onAttendanceChange,
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
        initialActiveTab={initialActiveTab}
        onCreateFollowupTask={onCreateFollowupTask}
        attendanceRecords={attendanceRecords}
        followupTasks={followupTasks}
        onAttendanceChange={onAttendanceChange}
      />
      <AiCommentDrawer
        open={aiDrawerOpen}
        student={student}
        onClose={() => setAiDrawerOpen(false)}
      />
    </>
  );
}
