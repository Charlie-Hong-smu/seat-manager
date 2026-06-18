import { useState } from "react";

import { AiCommentDrawer } from "./AiCommentDrawer";
import { StudentModal } from "./StudentModal";
import type { AppStudent } from "../state/types";

interface StudentDetailProps {
  student: AppStudent;
  students: AppStudent[];
  onClose: () => void;
}

export function StudentDetail({ student, students, onClose }: StudentDetailProps) {
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  return (
    <>
      <StudentModal
        student={student}
        students={students}
        onClose={onClose}
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
