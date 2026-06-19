export type TagKind = "academic" | "behavior";

export interface TagOption {
  id: string;
  label: string;
  kind: TagKind;
  groupId: string;
  groupName: string;
}

export interface TagGroup {
  id: string;
  name: string;
  kind: TagKind;
  tags: TagOption[];
}

export const TAG_CATALOG: TagOption[] = [
  { id: "cn_strong", label: "语文强", kind: "academic", groupId: "lvl_cn", groupName: "语文水平" },
  { id: "cn_mid", label: "语文中", kind: "academic", groupId: "lvl_cn", groupName: "语文水平" },
  { id: "cn_weak", label: "语文弱", kind: "academic", groupId: "lvl_cn", groupName: "语文水平" },
  { id: "math_strong", label: "数学强", kind: "academic", groupId: "lvl_math", groupName: "数学水平" },
  { id: "math_mid", label: "数学中", kind: "academic", groupId: "lvl_math", groupName: "数学水平" },
  { id: "math_weak", label: "数学弱", kind: "academic", groupId: "lvl_math", groupName: "数学水平" },
  { id: "en_strong", label: "英语强", kind: "academic", groupId: "lvl_en", groupName: "英语水平" },
  { id: "en_mid", label: "英语中", kind: "academic", groupId: "lvl_en", groupName: "英语水平" },
  { id: "en_weak", label: "英语弱", kind: "academic", groupId: "lvl_en", groupName: "英语水平" },
  { id: "physics_strong", label: "物理强", kind: "academic", groupId: "lvl_physics", groupName: "物理水平" },
  { id: "physics_mid", label: "物理中", kind: "academic", groupId: "lvl_physics", groupName: "物理水平" },
  { id: "physics_weak", label: "物理弱", kind: "academic", groupId: "lvl_physics", groupName: "物理水平" },
  { id: "chemistry_strong", label: "化学强", kind: "academic", groupId: "lvl_chemistry", groupName: "化学水平" },
  { id: "chemistry_mid", label: "化学中", kind: "academic", groupId: "lvl_chemistry", groupName: "化学水平" },
  { id: "chemistry_weak", label: "化学弱", kind: "academic", groupId: "lvl_chemistry", groupName: "化学水平" },
  { id: "geo_strong", label: "地理强", kind: "academic", groupId: "lvl_geo", groupName: "地理水平" },
  { id: "geo_mid", label: "地理中", kind: "academic", groupId: "lvl_geo", groupName: "地理水平" },
  { id: "geo_weak", label: "地理弱", kind: "academic", groupId: "lvl_geo", groupName: "地理水平" },
  { id: "history_strong", label: "历史强", kind: "academic", groupId: "lvl_history", groupName: "历史水平" },
  { id: "history_mid", label: "历史中", kind: "academic", groupId: "lvl_history", groupName: "历史水平" },
  { id: "history_weak", label: "历史弱", kind: "academic", groupId: "lvl_history", groupName: "历史水平" },
  { id: "politics_strong", label: "政治强", kind: "academic", groupId: "lvl_politics", groupName: "政治水平" },
  { id: "politics_mid", label: "政治中", kind: "academic", groupId: "lvl_politics", groupName: "政治水平" },
  { id: "politics_weak", label: "政治弱", kind: "academic", groupId: "lvl_politics", groupName: "政治水平" },
  { id: "biology_strong", label: "生物强", kind: "academic", groupId: "lvl_biology", groupName: "生物水平" },
  { id: "biology_mid", label: "生物中", kind: "academic", groupId: "lvl_biology", groupName: "生物水平" },
  { id: "biology_weak", label: "生物弱", kind: "academic", groupId: "lvl_biology", groupName: "生物水平" },
  { id: "talkative", label: "爱讲话", kind: "behavior", groupId: "trait_talk", groupName: "课堂表达" },
  { id: "quiet", label: "沉默", kind: "behavior", groupId: "trait_talk", groupName: "课堂表达" },
  { id: "distractible", label: "容易分心", kind: "behavior", groupId: "trait_focus", groupName: "专注情况" },
  { id: "focused", label: "专注", kind: "behavior", groupId: "trait_focus", groupName: "专注情况" },
  { id: "leader", label: "主动", kind: "behavior", groupId: "trait_role", groupName: "课堂角色" },
  { id: "supporter", label: "配合", kind: "behavior", groupId: "trait_role", groupName: "课堂角色" },
];

export const TAG_LABELS: Record<string, string> = TAG_CATALOG.reduce<Record<string, string>>((labels, tag) => {
  labels[tag.id] = tag.label;
  return labels;
}, {});

export const BEHAVIOR_TAG_IDS = new Set(TAG_CATALOG.filter(tag => tag.kind === "behavior").map(tag => tag.id));

export const BEHAVIOR_TAG_GROUPS: TagGroup[] = TAG_CATALOG.filter(tag => tag.kind === "behavior").reduce<TagGroup[]>((groups, tag) => {
  let group = groups.find(item => item.id === tag.groupId);
  if (!group) {
    group = { id: tag.groupId, name: tag.groupName, kind: tag.kind, tags: [] };
    groups.push(group);
  }
  group.tags.push(tag);
  return groups;
}, []);

export function getTagLabel(id: string): string {
  return TAG_LABELS[id] || id;
}

export function getTagLabels(ids: string[], extraLabels: Record<string, string> = {}): string[] {
  return ids.map(id => extraLabels[id] || getTagLabel(id)).filter(Boolean);
}

export function isAcademicTagLabel(label: string): boolean {
  return /^(语文|数学|英语|物理|化学|地理|历史|政治|生物)(强|中|弱)$/.test(label);
}
