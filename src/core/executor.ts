import type { ListItem } from "mdast";
import { parseTaskMeta } from "./format";
import { collectIds, generateId } from "./ids";
import {
  appendRootTask,
  createTaskItem,
  ensureChildList,
  getTaskId,
  indexTasks,
  parseMdast,
  setTaskItemContent,
  stringifyMdast,
  taskItemText,
  visitDescendantTaskItems,
  visitTaskItems,
} from "./mdastDoc";
import type { ApplyResult, Op } from "./ops";

function applyOne(
  root: ReturnType<typeof parseMdast>,
  op: Op,
  ids: Set<string>,
): string | null {
  const tasks = indexTasks(root);

  switch (op.op) {
    case "complete":
    case "uncomplete": {
      const located = tasks.get(op.id);
      if (!located) return `找不到任务 ^${op.id}`;
      const completed = op.op === "complete";

      const applyChecked = (item: ListItem, id: string) => {
        if (item.checked === completed) return;
        const meta = parseTaskMeta(taskItemText(item));
        meta.id = id;
        setTaskItemContent(item, completed, meta);
      };

      applyChecked(located.item, op.id);
      visitDescendantTaskItems(located.item, (child) => {
        const childId = getTaskId(child);
        if (childId) applyChecked(child, childId);
      });
      return null;
    }
    case "edit": {
      const located = tasks.get(op.id);
      if (!located) return `找不到任务 ^${op.id}`;
      const meta = parseTaskMeta(taskItemText(located.item));
      if (op.new_text !== undefined) meta.text = op.new_text;
      if (op.new_due !== undefined) {
        meta.due = op.new_due === null ? undefined : op.new_due;
      }
      if (op.new_time !== undefined) {
        meta.time = op.new_time === null ? undefined : op.new_time;
      }
      if (op.new_tags !== undefined) meta.tags = op.new_tags;
      meta.id = op.id;
      setTaskItemContent(
        located.item,
        located.item.checked === true,
        meta,
      );
      return null;
    }
    case "delete": {
      const located = tasks.get(op.id);
      if (!located) return `找不到任务 ^${op.id}`;
      const idx = located.list.children.indexOf(located.item);
      if (idx >= 0) located.list.children.splice(idx, 1);
      return null;
    }
    case "add": {
      const text = op.text.trim();
      if (!text) return "新增任务正文不能为空";
      const id = generateId(ids);
      const meta = {
        text,
        due: op.due,
        time: op.time,
        tags: op.tags ?? [],
        id,
      };
      const item = createTaskItem(meta, false);
      if (!op.parent_id) {
        appendRootTask(root, item);
        return null;
      }
      const parent = tasks.get(op.parent_id);
      if (!parent) return `找不到父任务 ^${op.parent_id}`;
      ensureChildList(parent.item).children.push(item);
      return null;
    }
    case "decompose": {
      const parent = tasks.get(op.id);
      if (!parent) return `找不到任务 ^${op.id}`;
      if (!op.subtasks.length) return "拆解子任务列表为空";
      const parentDue = parseTaskMeta(taskItemText(parent.item)).due;
      const list = ensureChildList(parent.item);
      for (const s of op.subtasks) {
        const text = s.text.trim();
        if (!text) continue;
        let due = s.due;
        if (parentDue && due && due > parentDue) due = parentDue;
        const id = generateId(ids);
        list.children.push(
          createTaskItem(
            { text, due, time: s.time, tags: s.tags ?? [], id },
            false,
          ),
        );
      }
      return null;
    }
    default:
      return "未知操作";
  }
}

/**
 * 确定性执行操作数组：mdast 解析 → 改目标任务节点 → remark 序列化回写。
 */
export function applyOps(source: string, ops: Op[]): ApplyResult {
  const root = parseMdast(source);
  const ids = collectIds(source);
  const applied: Op[] = [];
  const skipped: ApplyResult["skipped"] = [];

  for (const op of ops) {
    const reason = applyOne(root, op, ids);
    if (reason) skipped.push({ op, reason });
    else applied.push(op);
  }

  return { source: stringifyMdast(root), applied, skipped };
}

/**
 * 给缺少 ^id 的任务行补 ID（只改对应 listItem 节点正文）。
 */
export function ensureTaskIds(source: string): string | null {
  const root = parseMdast(source);
  const ids = collectIds(source);
  let changed = false;

  visitTaskItems(root, (item) => {
    const meta = parseTaskMeta(taskItemText(item));
    if (meta.id) return;
    meta.id = generateId(ids);
    setTaskItemContent(item, item.checked === true, meta);
    changed = true;
  });

  return changed ? stringifyMdast(root) : null;
}
