/**
 * Markdown 文档 mdast 读写（指导.md §6.3：remark-gfm 解析 → 改节点 → 序列化回写）
 */
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { List, ListItem, Paragraph, Root, RootContent } from "mdast";
import { formatTaskMeta, parseTaskMeta } from "./format";

export interface LocatedTask {
  item: ListItem;
  list: List;
  id: string;
}

export function parseMdast(source: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
}

export function stringifyMdast(tree: Root): string {
  return unified()
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: "-",
      rule: "-",
      listItemIndent: "one",
      fences: true,
      resourceLink: true,
    })
    .stringify(tree) as string;
}

export function isTaskListItem(item: ListItem): boolean {
  return typeof item.checked === "boolean";
}

export function taskItemText(item: ListItem): string {
  const parts: string[] = [];
  for (const child of item.children) {
    if (child.type === "paragraph") parts.push(toString(child));
  }
  return parts.join(" ").trim();
}

export function getTaskId(item: ListItem): string {
  return parseTaskMeta(taskItemText(item)).id;
}

export function setTaskItemContent(
  item: ListItem,
  completed: boolean,
  meta: { text: string; due?: string; time?: string; tags?: string[]; id: string },
) {
  item.checked = completed;
  const text = formatTaskMeta(meta);
  let para = item.children.find((c) => c.type === "paragraph") as
    | Paragraph
    | undefined;
  if (!para) {
    para = { type: "paragraph", children: [] };
    item.children.unshift(para);
  }
  para.children = [{ type: "text", value: text }];
}

export function createTaskItem(
  meta: { text: string; due?: string; time?: string; tags?: string[]; id: string },
  completed = false,
): ListItem {
  return {
    type: "listItem",
    checked: completed,
    spread: false,
    children: [
      {
        type: "paragraph",
        children: [{ type: "text", value: formatTaskMeta(meta) }],
      },
    ],
  };
}

function childList(item: ListItem): List | null {
  for (const c of item.children) {
    if (c.type === "list") return c;
  }
  return null;
}

/** 递归访问某任务下的所有嵌套子任务 */
export function visitDescendantTaskItems(
  item: ListItem,
  visit: (child: ListItem) => void,
) {
  const list = childList(item);
  if (!list) return;
  for (const node of list.children) {
    if (node.type !== "listItem" || !isTaskListItem(node)) continue;
    visit(node);
    visitDescendantTaskItems(node, visit);
  }
}

export function ensureChildList(item: ListItem): List {
  const existing = childList(item);
  if (existing) return existing;
  const list: List = { type: "list", ordered: false, spread: false, children: [] };
  item.children.push(list);
  return list;
}

function walkContent(nodes: RootContent[], visit: (item: ListItem, list: List) => void) {
  for (const node of nodes) {
    if (node.type === "list") {
      for (const child of node.children) {
        if (child.type !== "listItem" || !isTaskListItem(child)) continue;
        visit(child, node);
        walkContent(child.children as RootContent[], visit);
      }
    } else if ("children" in node && Array.isArray(node.children)) {
      walkContent(node.children as RootContent[], visit);
    }
  }
}

export function indexTasks(root: Root): Map<string, LocatedTask> {
  const map = new Map<string, LocatedTask>();
  walkContent(root.children, (item, list) => {
    const id = getTaskId(item);
    if (id) map.set(id, { item, list, id });
  });
  return map;
}

export function visitTaskItems(root: Root, visit: (item: ListItem) => void) {
  walkContent(root.children, (item) => visit(item));
}

function lastRootList(root: Root): List | null {
  let last: List | null = null;
  for (const node of root.children) {
    if (node.type === "list") last = node;
  }
  return last;
}

export function appendRootTask(root: Root, item: ListItem) {
  const list = lastRootList(root);
  if (list) {
    list.children.push(item);
    return;
  }
  root.children.push({
    type: "list",
    ordered: false,
    spread: false,
    children: [item],
  });
}
