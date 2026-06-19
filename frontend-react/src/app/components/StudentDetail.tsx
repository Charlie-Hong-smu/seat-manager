import { useState } from "react";

import { AiCommentDrawer } from "./AiCommentDrawer";
import { StudentModal } from "./StudentModal";
import type { AppStudent, StudentId, StudentRecord } from "../state/types";

interface StudentDetailProps {
  student: AppStudent;
  students: AppStudent[];
  onClose: () => void;
  onUpdateStudent: (student: AppStudent) => void;
  onApplyRecord: (studentId: StudentId, record: StudentRecord, syncIds: StudentId[]) => void;
  onDeleteStudent: (studentId: StudentId) => void;
}

export function StudentDetail({
  student,
  students,
  onClose,
  onUpdateStudent,
  onApplyRecord,
  onDeleteStudent,
}: StudentDetailProps) {
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  return (
    <>
      <StudentModal
        key={student.id}
        student={student}
        students={students}
        onClose={onClose}
        onUpdateStudent={onUpdateStudent}
        onApplyRecord={onApplyRecord}
        onDeleteStudent={onDeleteStudent}
        onOpenAiComment={() => setAiDrawerOpen(true)}
      />
      <AiCommentDrawer
        open={aiDrawerOpen}
        student={student}
        onClose={() => setAiDrawerOpen(false)}
      />
    </>
  );
}
