/**
 * TextFlow Markdown 任务行元数据约定：
 * - [ ] 正文 🗓️YYYY-MM-DD #标签 ^id
 * 嵌套项用缩进列表表示。
 */

export const DUE_RE = /🗓️(\d{4}-\d{2}-\d{2})/u;
export const TAG_RE = /#([\p{L}\p{N}_/-]+)/gu;
export const ID_RE = /\^([a-z0-9]{4,6})\s*$/u;

export interface TaskMeta {
  text: string;
  due?: string;
  tags: string[];
  id: string;
}

/** 从任务行正文中剥离元数据（日期 / 标签 / ID） */
export function parseTaskMeta(raw: string): TaskMeta {
  let rest = raw.trim();
  let id = "";
  let due: string | undefined;
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

  rest = rest.replace(TAG_RE, (_m, tag: string) => {
    tags.push(tag);
    return "";
  });

  return {
    text: rest.replace(/\s+/g, " ").trim(),
    due,
    tags,
    id,
  };
}

/** 把元数据拼回行尾（Executor 回写时用） */
export function formatTaskMeta(meta: {
  text: string;
  due?: string;
  tags?: string[];
  id: string;
}): string {
  const parts = [meta.text.trim()];
  if (meta.due) parts.push(`🗓️${meta.due}`);
  for (const tag of meta.tags ?? []) {
    parts.push(`#${tag}`);
  }
  if (meta.id) parts.push(`^${meta.id}`);
  return parts.join(" ");
}
