import { computed, ref } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { applyOps, ensureTaskIds } from "../core/executor";
import { atomicWriteTextFile } from "../core/fsWrite";
import { dedupeOnboarding, ensureOnboarding } from "../core/onboarding";
import type { Op } from "../core/ops";
import { parseMarkdown } from "../core/parser";
import { snapshots } from "../core/snapshot";
import type { Task } from "../core/types";

const STORAGE_KEY = "textflow.boundMdPath";

export function useTodoFile() {
  const filePath = ref<string | null>(localStorage.getItem(STORAGE_KEY));
  const source = ref("");
  const tasks = ref<Task[]>([]);
  const error = ref<string | null>(null);
  const binding = ref(false);
  const writing = ref(false);
  const canUndo = ref(false);

  const fileName = computed(() => {
    if (!filePath.value) return null;
    const parts = filePath.value.split(/[/\\]/);
    return parts[parts.length - 1] || filePath.value;
  });

  function refreshFromSource(text: string) {
    const parsed = parseMarkdown(text);
    source.value = parsed.source;
    tasks.value = parsed.tasks;
  }

  function syncUndoState() {
    canUndo.value = snapshots.canUndo;
  }

  async function persist(next: string, label: string) {
    if (!filePath.value) throw new Error("尚未绑定 Markdown 文件");
    writing.value = true;
    try {
      snapshots.push({
        path: filePath.value,
        source: source.value,
        label,
      });
      await atomicWriteTextFile(filePath.value, next);
      refreshFromSource(next);
      error.value = null;
      syncUndoState();
    } finally {
      writing.value = false;
    }
  }

  async function loadFromPath(path: string) {
    const raw = await readTextFile(path);
    let text = dedupeOnboarding(raw);

    const withOnboarding = ensureOnboarding(text);
    if (withOnboarding) text = withOnboarding;

    const withIds = ensureTaskIds(text);
    if (withIds) text = withIds;

    filePath.value = path;
    localStorage.setItem(STORAGE_KEY, path);
    snapshots.clear();
    syncUndoState();

    if (text !== raw) {
      refreshFromSource(text);
      await atomicWriteTextFile(path, text);
      error.value = null;
      return;
    }

    refreshFromSource(text);
    error.value = null;
  }

  async function reload() {
    if (!filePath.value) return;
    try {
      await loadFromPath(filePath.value);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function bindMarkdownFile() {
    binding.value = true;
    error.value = null;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      await loadFromPath(selected);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      binding.value = false;
    }
  }

  function clearBinding() {
    filePath.value = null;
    source.value = "";
    tasks.value = [];
    error.value = null;
    snapshots.clear();
    syncUndoState();
    localStorage.removeItem(STORAGE_KEY);
  }

  async function runOps(ops: Op[], label = "编辑") {
    if (!filePath.value) {
      error.value = "请先打开一份 .md 文件";
      return;
    }
    try {
      const result = applyOps(source.value, ops);
      if (!result.applied.length) {
        error.value =
          result.skipped[0]?.reason ?? "没有可执行的操作";
        return;
      }
      await persist(result.source, label);
      if (result.skipped.length) {
        error.value = result.skipped.map((s) => s.reason).join("；");
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function toggleTask(id: string, completed: boolean) {
    if (!id) {
      error.value = "该任务缺少稳定 ID，请重新打开文件以自动补全";
      return;
    }
    await runOps(
      [{ op: completed ? "complete" : "uncomplete", id }],
      completed ? "完成任务" : "取消完成",
    );
  }

  async function addTask(text: string, parentId?: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    await runOps(
      [{ op: "add", text: trimmed, parent_id: parentId }],
      "新增任务",
    );
  }

  async function deleteTask(id: string) {
    await runOps([{ op: "delete", id }], "删除任务");
  }

  async function editTask(id: string, newText: string) {
    const trimmed = newText.trim();
    if (!id || !trimmed) return;
    await runOps([{ op: "edit", id, new_text: trimmed }], "编辑任务");
  }

  async function undo() {
    const snap = snapshots.pop();
    syncUndoState();
    if (!snap || !filePath.value) return;
    if (snap.path !== filePath.value) {
      error.value = "快照与当前文件不一致";
      return;
    }
    writing.value = true;
    try {
      await atomicWriteTextFile(filePath.value, snap.source);
      refreshFromSource(snap.source);
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      writing.value = false;
      syncUndoState();
    }
  }

  if (filePath.value) {
    reload().catch(() => {
      clearBinding();
    });
  }

  return {
    filePath,
    fileName,
    source,
    tasks,
    error,
    binding,
    writing,
    canUndo,
    bindMarkdownFile,
    clearBinding,
    reload,
    runOps,
    toggleTask,
    addTask,
    deleteTask,
    editTask,
    undo,
  };
}
