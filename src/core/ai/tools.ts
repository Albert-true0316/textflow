import type { Op } from "../ops";
import type { Task } from "../types";
import { flattenTasks } from "../parser";
import { normalizeClockTime, stripTemporalPhrases } from "../format";

export const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "apply_todo_ops",
      description:
        "将用户的自然语言待办意图翻译为一组结构化操作。只能使用这些操作，不要改写整个文件。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          ops: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                op: {
                  type: "string",
                  enum: [
                    "add",
                    "complete",
                    "uncomplete",
                    "edit",
                    "delete",
                    "decompose",
                  ],
                },
                id: { type: "string" },
                text: {
                  type: "string",
                  description:
                    "事项本身，不要包含「明天/上午九点」等时间话术",
                },
                due: { type: "string", description: "YYYY-MM-DD" },
                time: {
                  type: "string",
                  description: "可选钟点，24小时制 HH:mm，如 09:00",
                },
                tags: { type: "array", items: { type: "string" } },
                parent_id: {
                  type: "string",
                  description: "可选：新任务要归入哪条已有任务之下",
                },
                new_text: { type: "string" },
                new_due: { type: ["string", "null"] },
                new_time: { type: ["string", "null"] },
                new_tags: { type: "array", items: { type: "string" } },
                subtasks: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      text: { type: "string" },
                      due: { type: "string" },
                      time: { type: "string" },
                      tags: { type: "array", items: { type: "string" } },
                    },
                    required: ["text"],
                  },
                },
              },
              required: ["op"],
            },
          },
        },
        required: ["ops"],
      },
    },
  },
] as const;

export function buildTaskContext(tasks: Task[]): string {
  const flat = flattenTasks(tasks);
  if (!flat.length) return "(当前没有任务)";
  return flat
    .map((t) => {
      const pad = "  ".repeat(t.depth);
      const mark = t.completed ? "[x]" : "[ ]";
      const due = t.due ? ` due:${t.due}` : "";
      const time = t.time ? ` time:${t.time}` : "";
      const tags = t.tags.length ? ` tags:${t.tags.join(",")}` : "";
      return `${pad}- ${mark} ${t.text} ^${t.id}${due}${time}${tags}`;
    })
    .join("\n");
}

export function systemPrompt(today: string, decomposeCount = 4): string {
  return `你是 TextFlow 里的待办小助手：听懂大白话，翻译成结构化操作。今天是 ${today}。

用户可能说得很随意，例如：
- 「买菜搞定了」→ complete 对应任务
- 「加个周五交报告」→ add，text「交报告」，due 换算成具体日期
- 「明天上午九点开会」→ add，text「开会」，due=明天，time=09:00（不要把时间话术留在 text 里）
- 「帮我拆一下准备答辩」→ decompose
- 「删掉那个旧的」→ 根据上下文匹配 id 再 delete

规则：
1. 只通过 apply_todo_ops 工具输出，不要改写整份文件，不要输出 Markdown 正文。
2. 动已有任务时 id 必须是上下文里已有的那串（例如 a3f2），不要带 ^ 前缀；认不准就返回空 ops，别瞎猜。
3. 「今天 / 明天 / 本周五 / 下周一 / 7月18日」等日期线索一律换算成 due 字段（YYYY-MM-DD）；改期用 edit 的 new_due。
4. 「上午九点 / 14:30 / 晚上8点」等钟点写入 time 字段（24小时制 HH:mm）；没有钟点可不填 time。
5. add / edit 的 text（或 new_text）只写事项本身，必须去掉「今天/明天/上午/九点」等时间话术。错误：「明天上午九点开会」；正确：text「开会」+ due + time。
6. add 新增任务时：用户只要提到日期（含隐含「今晚」「这周末」），必须填 due；提到钟点必须填 time。
7. 拆解用 decompose：id 填要拆的那条任务（不带 ^），子任务尽量带可执行的 due/time（若父任务有截止日期，子任务 due 应不晚于父任务）；输出 3–6 条具体子任务（默认约 ${decomposeCount} 条，可 ±1）；禁止空话。子任务 ID 由执行器生成，不要自造 ^id。
8. 听不懂就返回空 ops 数组。`;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** 模型常把 ^id 原样塞进 id 字段，统一去掉 ^ 并转小写 */
export function normalizeTaskId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const id = raw.trim().replace(/^\^+/, "").toLowerCase();
  return id || undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

const knownIds = (tasks: Task[]) =>
  new Set(flattenTasks(tasks).map((t) => t.id).filter(Boolean));

export interface ValidateOpsOptions {
  /** 点「拆」时传入：decompose 的 id 对不上时强制用这个任务 */
  forceDecomposeId?: string;
}

/** 校验 LLM 输出，非法项丢弃 */
export function validateOps(
  raw: unknown,
  tasks: Task[],
  options?: ValidateOpsOptions,
): { ops: Op[]; rejected: string[] } {
  const ids = knownIds(tasks);
  const rejected: string[] = [];
  const ops: Op[] = [];

  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { ops?: unknown }).ops)
      ? (raw as { ops: unknown[] }).ops
      : null;

  if (!list) {
    return { ops: [], rejected: ["模型未返回合法 ops 数组"] };
  }

  for (const item of list) {
    if (!item || typeof item !== "object") {
      rejected.push("跳过非对象操作");
      continue;
    }
    const row = item as Record<string, unknown>;
    const op = row.op;
    try {
      switch (op) {
        case "complete":
        case "uncomplete":
        case "delete": {
          const id = normalizeTaskId(asString(row.id));
          if (!id || !ids.has(id)) {
            rejected.push(`${op}: 无效 id`);
            break;
          }
          ops.push({ op, id });
          break;
        }
        case "add": {
          const rawText = asString(row.text);
          if (!rawText) {
            rejected.push("add: 缺少 text");
            break;
          }
          const text = stripTemporalPhrases(rawText);
          const parent_id = normalizeTaskId(asString(row.parent_id));
          if (parent_id && !ids.has(parent_id)) {
            rejected.push("add: 无效归属任务 id");
            break;
          }
          ops.push({
            op: "add",
            text,
            due: asString(row.due),
            time: normalizeClockTime(asString(row.time)),
            tags: asStringArray(row.tags),
            parent_id,
          });
          break;
        }
        case "edit": {
          const id = normalizeTaskId(asString(row.id));
          if (!id || !ids.has(id)) {
            rejected.push("edit: 无效 id");
            break;
          }
          const new_text_raw = asString(row.new_text);
          ops.push({
            op: "edit",
            id,
            new_text: new_text_raw
              ? stripTemporalPhrases(new_text_raw)
              : undefined,
            new_due:
              row.new_due === null
                ? null
                : asString(row.new_due),
            new_time:
              row.new_time === null
                ? null
                : normalizeClockTime(asString(row.new_time)),
            new_tags: asStringArray(row.new_tags),
          });
          break;
        }
        case "decompose": {
          let id = normalizeTaskId(asString(row.id));
          if ((!id || !ids.has(id)) && options?.forceDecomposeId) {
            const forced = normalizeTaskId(options.forceDecomposeId);
            if (forced && ids.has(forced)) id = forced;
          }
          if (!id || !ids.has(id)) {
            rejected.push("decompose: 无效 id");
            break;
          }
          const subtasksRaw = Array.isArray(row.subtasks) ? row.subtasks : [];
          const subtasks = subtasksRaw
            .map((s) => {
              if (!s || typeof s !== "object") return null;
              const text = asString((s as { text?: unknown }).text);
              if (!text) return null;
              return {
                text: stripTemporalPhrases(text),
                due: asString((s as { due?: unknown }).due),
                time: normalizeClockTime(
                  asString((s as { time?: unknown }).time),
                ),
                tags: asStringArray((s as { tags?: unknown }).tags),
              };
            })
            .filter((s): s is NonNullable<typeof s> => !!s);
          if (!subtasks.length) {
            rejected.push("decompose: 无有效子任务");
            break;
          }
          if (subtasks.length < 3 || subtasks.length > 6) {
            rejected.push(`decompose: 子任务应为 3–6 条（当前 ${subtasks.length}）`);
            break;
          }
          ops.push({ op: "decompose", id, subtasks });
          break;
        }
        default:
          rejected.push(`未知 op: ${String(op)}`);
      }
    } catch {
      rejected.push("解析操作失败");
    }
  }

  return { ops, rejected };
}

export function describeOp(op: Op, tasks: Task[]): string {
  const title = (id: string) =>
    flattenTasks(tasks).find((t) => t.id === id)?.text ?? `^${id}`;

  switch (op.op) {
    case "complete":
      return `完成：${title(op.id)}`;
    case "uncomplete":
      return `取消完成：${title(op.id)}`;
    case "delete":
      return `删除：${title(op.id)}`;
    case "add":
      return `新增：${op.text}${op.due ? ` · ${op.due}` : ""}${op.time ? ` ${op.time}` : ""}${op.parent_id ? `（归入「${title(op.parent_id)}」下）` : ""}`;
    case "edit":
      return `修改：${title(op.id)}${op.new_text ? ` → ${op.new_text}` : ""}`;
    case "decompose":
      return `拆解：${title(op.id)} → ${op.subtasks.length} 条子任务`;
  }
}
