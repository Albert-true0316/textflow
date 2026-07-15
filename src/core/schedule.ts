import type { Task } from "./types";

export type ScheduleTask = {
  id: string;
  text: string;
  completed: boolean;
  due?: string;
  tags: string[];
  children: ScheduleTask[];
  depth: number;
  /** 父任务不在同组时，显示祖先路径 */
  parentPath?: string;
};

export type ScheduleLayoutMode = "summary" | "week";

export interface ScheduleSection {
  id: string;
  title: string;
  tasks: ScheduleTask[];
  overdue?: boolean;
  /** 本周视图：标记今天 */
  isToday?: boolean;
  /** 本周视图：该日无任务 */
  empty?: boolean;
}

type FlatNode = {
  id: string;
  text: string;
  completed: boolean;
  due?: string;
  tags: string[];
  depth: number;
  parentId?: string;
  order: number;
  parentPath?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;
/** 自然周：周一～周日 */
const WEEKDAYS_MON_FIRST = ["一", "二", "三", "四", "五", "六", "日"] as const;

function formatMonthDay(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatDateTitle(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  return `${m}月${day}日 周${WEEKDAYS[d.getDay()]}`;
}

function weekdayMonFirst(d: Date): string {
  const js = d.getDay();
  const idx = js === 0 ? 6 : js - 1;
  return WEEKDAYS_MON_FIRST[idx];
}

/** 自然周周一（本地时区） */
export function startOfWeekMonday(d: Date): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const js = base.getDay();
  const diff = js === 0 ? -6 : 1 - js;
  return addDays(base, diff);
}

export function isOverdue(due: string | undefined, today = new Date()): boolean {
  if (!due) return false;
  return due < toISODate(today);
}

export function overdueDays(due: string, today = new Date()): number {
  const todayStr = toISODate(today);
  if (due >= todayStr) return 0;
  const [y, m, day] = due.split("-").map(Number);
  const dueDate = new Date(y, m - 1, day);
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ms = todayDate.getTime() - dueDate.getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

function walkFlat(
  tasks: Task[],
  depth = 0,
  parentId?: string,
  counter = { n: 0 },
): FlatNode[] {
  const out: FlatNode[] = [];
  for (const task of tasks) {
    const order = counter.n++;
    out.push({
      id: task.id,
      text: task.text,
      completed: task.completed,
      due: task.due,
      tags: task.tags,
      depth,
      parentId,
      order,
    });
    if (task.children.length) {
      out.push(...walkFlat(task.children, depth + 1, task.id || undefined, counter));
    }
  }
  return out;
}

/**
 * 在同一分组内重建父子树：父任务在前，子任务嵌套在后。
 * 父不在同组时，子任务作为根，并保留 parentPath。
 */
export function rebuildTreesInBucket(nodes: FlatNode[]): ScheduleTask[] {
  if (!nodes.length) return [];

  const inBucket = new Set(nodes.map((n) => n.id).filter(Boolean));
  const items = new Map<string, ScheduleTask>();
  const roots: ScheduleTask[] = [];
  const ordered = [...nodes].sort((a, b) => a.order - b.order);

  for (const n of ordered) {
    const key = n.id || `__anon_${n.order}`;
    items.set(key, {
      id: n.id,
      text: n.text,
      completed: n.completed,
      due: n.due,
      tags: n.tags,
      children: [],
      depth: 0,
      parentPath:
        n.parentId && inBucket.has(n.parentId) ? undefined : n.parentPath,
    });
  }

  for (const n of ordered) {
    const key = n.id || `__anon_${n.order}`;
    const item = items.get(key)!;
    if (n.parentId && inBucket.has(n.parentId) && items.has(n.parentId)) {
      items.get(n.parentId)!.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

type BucketId = "overdue" | "today" | "tomorrow" | "no-due" | `date-${string}`;

function bucketFor(
  due: string | undefined,
  todayStr: string,
  tomorrowStr: string,
): BucketId {
  if (!due) return "no-due";
  if (due < todayStr) return "overdue";
  if (due === todayStr) return "today";
  if (due === tomorrowStr) return "tomorrow";
  return `date-${due}`;
}

function enrichFlatWithParentPath(flat: FlatNode[]): void {
  const textById = new Map<string, string>();
  const parentOf = new Map<string, string>();
  for (const n of flat) {
    if (n.id) textById.set(n.id, n.text);
    if (n.id && n.parentId) parentOf.set(n.id, n.parentId);
  }

  for (const n of flat) {
    if (!n.parentId) continue;
    const parts: string[] = [];
    let pid: string | undefined = n.parentId;
    const seen = new Set<string>();
    while (pid && !seen.has(pid)) {
      seen.add(pid);
      const text = textById.get(pid);
      if (text) parts.unshift(text);
      pid = parentOf.get(pid);
    }
    if (parts.length) n.parentPath = parts.join(" › ");
  }
}

/** 把任务树按截止日期分组；同组内保持父→子树形顺序 */
export function buildScheduleSections(
  tasks: Task[],
  today = new Date(),
): ScheduleSection[] {
  const flat = walkFlat(tasks);
  enrichFlatWithParentPath(flat);

  const todayStr = toISODate(today);
  const tomorrowStr = toISODate(addDays(today, 1));

  const buckets = new Map<BucketId, FlatNode[]>();
  const ensure = (id: BucketId) => {
    if (!buckets.has(id)) buckets.set(id, []);
    return buckets.get(id)!;
  };

  for (const n of flat) {
    ensure(bucketFor(n.due, todayStr, tomorrowStr)).push(n);
  }

  const sections: ScheduleSection[] = [];

  const push = (id: BucketId, title: string, overdue?: boolean) => {
    const nodes = buckets.get(id);
    if (!nodes?.length) return;
    sections.push({
      id,
      title,
      overdue,
      tasks: rebuildTreesInBucket(nodes),
    });
  };

  push("overdue", "已过期", true);
  push("today", `今天 · ${formatMonthDay(today)}`);
  push("tomorrow", `明天 · ${formatMonthDay(addDays(today, 1))}`);

  const laterDates = [...buckets.keys()]
    .filter((k): k is `date-${string}` => k.startsWith("date-"))
    .map((k) => k.slice(5))
    .sort();
  for (const iso of laterDates) {
    push(`date-${iso}`, formatDateTitle(iso));
  }
  push("no-due", "未设日期");

  return sections;
}

export type WeekDayChip = {
  iso: string;
  weekday: string;
  day: number;
  isToday: boolean;
  count: number;
};

/** 自然周日期条（周一～周日）+ 每天任务数 */
export function buildWeekDayChips(tasks: Task[], today = new Date()): WeekDayChip[] {
  const flat = walkFlat(tasks);
  const monday = startOfWeekMonday(today);
  const todayStr = toISODate(today);
  const chips: WeekDayChip[] = [];

  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const iso = toISODate(day);
    chips.push({
      iso,
      weekday: weekdayMonFirst(day),
      day: day.getDate(),
      isToday: iso === todayStr,
      count: flat.filter((n) => n.due === iso).length,
    });
  }
  return chips;
}

export type TagChip = {
  tag: string;
  count: number;
};

/** 标签条：按出现次数降序，同频按中文序 */
export function buildTagChips(tasks: Task[]): TagChip[] {
  const flat = walkFlat(tasks);
  const counts = new Map<string, number>();
  for (const n of flat) {
    for (const tag of n.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .map(([tag, count]) => ({ tag, count }));
}

/**
 * 按标签纵向分组。多标签任务会出现在每个相关分区（便于分类浏览）。
 * 无标签的进「未分类」。
 */
export function buildTagSections(tasks: Task[]): ScheduleSection[] {
  const flat = walkFlat(tasks);
  enrichFlatWithParentPath(flat);

  const buckets = new Map<string, FlatNode[]>();
  const noTag: FlatNode[] = [];

  for (const n of flat) {
    if (!n.tags.length) {
      noTag.push(n);
      continue;
    }
    for (const tag of n.tags) {
      if (!buckets.has(tag)) buckets.set(tag, []);
      buckets.get(tag)!.push(n);
    }
  }

  const tags = [...buckets.keys()].sort(
    (a, b) =>
      (buckets.get(b)?.length ?? 0) - (buckets.get(a)?.length ?? 0) ||
      a.localeCompare(b, "zh"),
  );

  const sections: ScheduleSection[] = tags.map((tag) => ({
    id: `tag-${tag}`,
    title: `#${tag}`,
    tasks: rebuildTreesInBucket(buckets.get(tag)!),
  }));

  if (noTag.length) {
    sections.push({
      id: "no-tag",
      title: "未分类",
      tasks: rebuildTreesInBucket(noTag),
    });
  }

  return sections;
}

/** 自然周（周一～周日）纵向分组；本周之前过期的任务单独一节 */
export function buildWeekScheduleSections(
  tasks: Task[],
  today = new Date(),
): ScheduleSection[] {
  const flat = walkFlat(tasks);
  enrichFlatWithParentPath(flat);

  const todayStr = toISODate(today);
  const monday = startOfWeekMonday(today);
  const weekStart = toISODate(monday);
  const sections: ScheduleSection[] = [];

  const overdueBeforeWeek = flat.filter((n) => n.due && n.due < weekStart);
  if (overdueBeforeWeek.length) {
    sections.push({
      id: "overdue",
      title: "更早（已过期）",
      overdue: true,
      tasks: rebuildTreesInBucket(overdueBeforeWeek),
    });
  }

  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const iso = toISODate(day);
    const nodes = flat.filter((n) => n.due === iso);
    const isToday = iso === todayStr;
    const wd = weekdayMonFirst(day);
    const md = formatMonthDay(day);

    sections.push({
      id: `week-${iso}`,
      title: isToday ? `今天 · 周${wd} ${md}` : `周${wd} · ${md}`,
      tasks: rebuildTreesInBucket(nodes),
      isToday,
      empty: nodes.length === 0,
    });
  }

  return sections;
}
