import { useLayoutEffect, useState } from "react";
import { updateStudentProfile } from "../state/studentActions";
import { BEHAVIOR_TAG_IDS } from "../state/tagCatalog";
import type { AppStudent } from "../state/types";
import { parseAliases, sortTagIds } from "../components/studentModalSelectors";

function createDraft(student: AppStudent) {
  return {
    name: student.name, gender: student.gender, aliases: student.aliases.join("、"),
    parentPhone: student.parentPhone || "", address: student.address || "",
    emergencyContact: student.emergencyContact || "", isBoarding: student.isBoarding === true,
    behaviorTags: new Set(student.manualTagIds.filter(id => BEHAVIOR_TAG_IDS.has(id))),
  };
}

/** A profile edit session belongs to the selected student and writes only on save. */
export function useStudentProfileEditor(student: AppStudent, onUpdateStudent: (student: AppStudent) => void, resetKey: string) {
  const [draft, setDraft] = useState(() => createDraft(student));
  const [profileStatus, setProfileStatus] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);

  useLayoutEffect(() => {
    setDraft(createDraft(student));
    setProfileStatus("");
    setProfileEditing(false);
  }, [student, resetKey]);

  function setField<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
  }

  const profileDirty = draft.name.trim() !== student.name || draft.gender !== student.gender
    || parseAliases(draft.aliases).join("|") !== student.aliases.join("|")
    || draft.parentPhone.trim() !== (student.parentPhone || "") || draft.address.trim() !== (student.address || "")
    || draft.emergencyContact.trim() !== (student.emergencyContact || "") || draft.isBoarding !== (student.isBoarding === true)
    || sortTagIds(draft.behaviorTags) !== sortTagIds(student.manualTagIds.filter(id => BEHAVIOR_TAG_IDS.has(id)));

  function toggleBehaviorTag(id: string) {
    setDraft(previous => {
      const behaviorTags = new Set(previous.behaviorTags);
      if (behaviorTags.has(id)) behaviorTags.delete(id);
      else behaviorTags.add(id);
      return { ...previous, behaviorTags };
    });
    setProfileStatus("");
  }

  function saveProfile() {
    if (!draft.name.trim()) { setProfileStatus("姓名不能为空。"); return; }
    onUpdateStudent(updateStudentProfile(student, {
      name: draft.name, gender: draft.gender, aliases: parseAliases(draft.aliases),
      parentPhone: draft.parentPhone, address: draft.address, emergencyContact: draft.emergencyContact,
      isBoarding: draft.isBoarding,
      manualTagIds: [...student.manualTagIds.filter(id => !BEHAVIOR_TAG_IDS.has(id)), ...draft.behaviorTags],
    }));
    setProfileStatus("学生信息已保存。");
    setProfileEditing(false);
  }

  function cancelProfileEditing() {
    setDraft(createDraft(student));
    setProfileEditing(false);
    setProfileStatus("已取消本次修改。");
  }

  return {
    nameInput: draft.name, setNameInput: (value: typeof draft.name) => setField("name", value),
    genderInput: draft.gender, setGenderInput: (value: typeof draft.gender) => setField("gender", value),
    aliasesInput: draft.aliases, setAliasesInput: (value: string) => setField("aliases", value),
    parentPhoneInput: draft.parentPhone, setParentPhoneInput: (value: string) => setField("parentPhone", value),
    addressInput: draft.address, setAddressInput: (value: string) => setField("address", value),
    emergencyContactInput: draft.emergencyContact, setEmergencyContactInput: (value: string) => setField("emergencyContact", value),
    isBoardingInput: draft.isBoarding, setIsBoardingInput: (value: boolean) => setField("isBoarding", value),
    selectedBehaviorTags: draft.behaviorTags, toggleBehaviorTag, saveProfile, cancelProfileEditing,
    profileDirty, profileStatus, setProfileStatus, profileEditing, setProfileEditing,
  };
}
