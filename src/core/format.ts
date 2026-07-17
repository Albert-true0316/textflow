/**
 * TextFlow Markdown 任务行元数据约定：
 * - [ ] 正文 🗓️YYYY-MM-DD 🕘HH:mm #标签 ^id
 * 嵌套项用缩进列表表示。
 */

export const DUE_RE = /🗓️(\d{4}-\d{2}-\d{2})/u;
export const TIME_RE = /🕘(\d{1,2}:\d{2})/u;
export const TAG_RE = /#([\p{L}\p{N}_/-]+)/gu;
export const ID_RE = /\^([a-z0-9]{4,6})\s*$/u;

export interface TaskMeta {
  text: string;
  due?: string;
  /** 可选钟点，24 小时制 HH:mm */
  time?: string;
  tags: string[];
  id: string;
}

/** 规范化为 HH:mm；非法则 undefined */
export function normalizeClockTime(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return undefined;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * 从任务标题里剥掉常见时间话术（后天兜底，主要仍靠模型）。
 * 「明天上午九点开会」→「开会」
 */
export function stripTemporalPhrases(text: string): string {
  let t = text.trim();
  if (!t) return t;
  const patterns: RegExp[] = [
    /^(今天|明天|后天|大后天|今晚|明早|明晚|今早|今夜)/u,
    /^(本|下|上)?周[一二三四五六日天]/u,
    /^(这周|本周|下周|上周)/u,
    /^\d{1,2}\s*月\s*\d{1,2}\s*日?/u,
    /^(星期|周)[一二三四五六日天]/u,
    /^(上午|下午|中午|晚上|傍晚|凌晨|清晨|午后)/u,
    /^\d{1,2}\s*[点时](\s*\d{1,2}\s*分?)?/u,
    /^[零一二三四五六七八九十两]{1,3}\s*点半?/u,
    /^[零一二三四五六七八九十两]{1,3}\s*[点时](\s*[零一二三四五六七八九十两\d]{1,3}\s*分?)?/u,
    /^\d{1,2}:\d{2}/u,
    /^半\s*小时后/u,
  ];
  let prev = "";
  while (prev !== t) {
    prev = t;
    for (const p of patterns) {
      t = t.replace(p, "").trim();
      t = t.replace(/^[的地得\s，,、]+/u, "").trim();
    }
  }
  return t || text.trim();
}

/** 从任务行正文中剥离元数据（日期 / 钟点 / 标签 / ID） */
export function parseTaskMeta(raw: string): TaskMeta {
  let rest = raw.trim();
  let id = "";
  let due: string | undefined;
  let time: string | undefined;
  const tags: string[] = [];

  const idMatch = rest.match(ID_RE);
  if (idMatch) {
    id = idMatch[1];
    rest = rest.slice(0, idMatch.index).trimEnd();
  }

  const dueMatch = rest.match(DUE_RE);
  if (dueMatch) {
    due = dueMatch[1];
    rest = `${rest.slice(0, dueMatch.index)}${rest.slice(dueMatch.index! + dueMatch[0].length)}`;
  }

  const timeMatch = rest.match(TIME_RE);
  if (timeMatch) {
    time = normalizeClockTime(timeMatch[1]);
    rest = `${rest.slice(0, timeMatch.index)}${rest.slice(timeMatch.index! + timeMatch[0].length)}`;
  }

  rest = rest.replace(TAG_RE, (_m, tag: string) => {
    tags.push(tag);
    return "";
  });

  return {
    text: rest.replace(/\s+/g, " ").trim(),
    due,
    time,
    tags,
    id,
  };
}

/** 把元数据拼回行尾（Executor 回写时用） */
export function formatTaskMeta(meta: {
  text: string;
  due?: string;
  time?: string;
  tags?: string[];
  id: string;
}): string {
  const parts = [meta.text.trim()];
  if (meta.due) parts.push(`🗓️${meta.due}`);
  const time = normalizeClockTime(meta.time);
  if (time) parts.push(`🕘${time}`);
  for (const tag of meta.tags ?? []) {
    parts.push(`#${tag}`);
  }
  if (meta.id) parts.push(`^${meta.id}`);
  return parts.join(" ");
}
