import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { List, ListItem, Root, RootContent } from "mdast";
import type { ParseResult, Task } from "./types";
import { parseTaskMeta } from "./format";

/** Parser：remark-gfm + mdast（指导.md §2、§3.2） */

function isTaskListItem(node: ListItem): boolean {
  return typeof node.checked === "boolean";
}

function listItemToTask(item: ListItem): Task | null {
  if (!isTaskListItem(item)) return null;

  const textParts: string[] = [];
  const childTasks: Task[] = [];

  for (const child of item.children) {
    if (child.type === "paragraph") {
      textParts.push(toString(child));
    } else if (child.type === "list") {
      childTasks.push(...extractTasksFromList(child));
    }
  }

  const meta = parseTaskMeta(textParts.join(" ").trim());

  return {
    id: meta.id,
    text: meta.text,
    completed: item.checked === true,
    due: meta.due,
    tags: meta.tags,
    children: childTasks,
  };
}

function extractTasksFromList(list: List): Task[] {
  const tasks: Task[] = [];
  for (const item of list.children) {
    if (item.type !== "listItem") continue;
    const task = listItemToTask(item);
    if (task) tasks.push(task);
  }
  return tasks;
}

function walk(nodes: RootContent[]): Task[] {
  const tasks: Task[] = [];
  for (const node of nodes) {
    if (node.type === "list") {
      tasks.push(...extractTasksFromList(node));
    } else if ("children" in node && Array.isArray(node.children)) {
      tasks.push(...walk(node.children as RootContent[]));
    }
  }
  return tasks;
}

/** 读 Markdown → 任务树（只解析，不改文件） */
export function parseMarkdown(source: string): ParseResult {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
  return {
    source,
    tasks: walk(tree.children),
  };
}

/** 扁平化任务树（含深度），供查找 / AI 上下文 */
export function flattenTasks(
  tasks: Task[],
  depth = 0,
): Array<Task & { depth: number }> {
  const out: Array<Task & { depth: number }> = [];
  for (const task of tasks) {
    out.push({ ...task, depth });
    if (task.children.length) {
      out.push(...flattenTasks(task.children, depth + 1));
    }
  }
  return out;
}

/** 有嵌套步骤时计算完成进度 */
export function taskProgress(task: Task): { done: number; total: number } | null {
  if (!task.children.length) return null;
  const flat = flattenTasks(task.children);
  const total = flat.length;
  const done = flat.filter((t) => t.completed).length;
  return { done, total };
}
