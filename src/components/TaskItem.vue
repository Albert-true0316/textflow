<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import type { Task } from "../core/types";
import { taskProgress } from "../core/parser";
import TaskItem from "./TaskItem.vue";

const props = defineProps<{
  task: Task;
  depth?: number;
}>();

const emit = defineEmits<{
  toggle: [id: string, completed: boolean];
  remove: [id: string];
  decompose: [id: string, text: string];
  edit: [id: string, newText: string];
  "add-under": [parentId: string, text: string];
}>();

const progress = computed(() => taskProgress(props.task));
const depth = computed(() => props.depth ?? 0);
const editing = ref(false);
const adding = ref(false);
const draft = ref("");
const addDraft = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const addInputRef = ref<HTMLInputElement | null>(null);
const rowRef = ref<HTMLDivElement | null>(null);

function onToggle() {
  if (!props.task.id || editing.value) return;
  emit("toggle", props.task.id, !props.task.completed);
}

function onRemove() {
  if (!props.task.id) return;
  emit("remove", props.task.id);
}

function onDecompose() {
  if (!props.task.id) return;
  emit("decompose", props.task.id, props.task.text);
}

function isModKey(e: KeyboardEvent) {
  return e.metaKey || e.ctrlKey;
}

async function startEdit() {
  if (!props.task.id) return;
  adding.value = false;
  editing.value = true;
  draft.value = props.task.text;
  await nextTick();
  inputRef.value?.focus();
  inputRef.value?.select();
}

function cancelEdit() {
  editing.value = false;
  draft.value = props.task.text;
}

function commitEdit() {
  if (!editing.value || !props.task.id) return;
  const next = draft.value.trim();
  editing.value = false;
  if (!next || next === props.task.text) return;
  emit("edit", props.task.id, next);
}

async function startAdd() {
  if (!props.task.id || editing.value) return;
  editing.value = false;
  adding.value = true;
  addDraft.value = "";
  await nextTick();
  addInputRef.value?.focus();
}

function cancelAdd() {
  adding.value = false;
  addDraft.value = "";
}

function commitAdd() {
  if (!adding.value || !props.task.id) return;
  const text = addDraft.value.trim();
  adding.value = false;
  addDraft.value = "";
  if (!text) return;
  emit("add-under", props.task.id, text);
}

async function commitEditThenAdd() {
  if (!editing.value || !props.task.id) return;
  const next = draft.value.trim();
  editing.value = false;
  if (next && next !== props.task.text) {
    emit("edit", props.task.id, next);
  }
  await startAdd();
}

function onRowKeydown(e: KeyboardEvent) {
  if (editing.value || adding.value) return;

  if (e.key === "Enter" && isModKey(e)) {
    e.preventDefault();
    onToggle();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    void startEdit();
    return;
  }
  if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    void startAdd();
    return;
  }
  if (e.key === "d" && isModKey(e) && e.shiftKey) {
    e.preventDefault();
    onDecompose();
    return;
  }
  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    onRemove();
  }
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && isModKey(e)) {
    e.preventDefault();
    commitEdit();
    onToggle();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    commitEdit();
    return;
  }
  if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    void commitEditThenAdd();
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    cancelEdit();
    rowRef.value?.focus();
  }
}

function onAddKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    commitAdd();
    rowRef.value?.focus();
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    cancelAdd();
    rowRef.value?.focus();
  }
}

function onTextClick() {
  void startEdit();
}
</script>

<template>
  <li
    class="task-item"
    :class="{ done: task.completed, editing, adding }"
    :style="{ marginLeft: depth ? '14px' : '0' }"
  >
    <div
      ref="rowRef"
      class="row"
      tabindex="0"
      :aria-label="`任务：${task.text || '无标题'}`"
      @keydown="onRowKeydown"
    >
      <button
        type="button"
        class="check"
        :class="{ on: task.completed }"
        :aria-pressed="task.completed"
        :aria-label="task.completed ? '标为未完成' : '标为完成'"
        :disabled="editing"
        @click="onToggle"
      />
      <div class="content">
        <input
          v-if="editing"
          ref="inputRef"
          v-model="draft"
          class="edit-input"
          type="text"
          aria-label="编辑任务"
          @keydown="onEditKeydown"
          @blur="commitEdit"
        />
        <span v-else class="text" @click.stop="onTextClick">{{ task.text || "(无标题)" }}</span>
        <span v-if="progress && !editing" class="progress">{{ progress.done }}/{{ progress.total }}</span>
        <button
          v-if="!editing && !adding"
          type="button"
          class="decompose-btn"
          title="AI 拆解（⌘/Ctrl+Shift+D）"
          aria-label="AI 拆解任务"
          @click.stop="onDecompose"
        >
          拆
        </button>
      </div>
    </div>
    <div v-if="!editing && (task.due || task.tags.length)" class="meta">
      <span v-if="task.due" class="due">{{ task.due }}</span>
      <span v-for="tag in task.tags" :key="tag" class="tag">#{{ tag }}</span>
    </div>
    <ul v-if="task.children.length" class="children">
      <TaskItem
        v-for="(child, index) in task.children"
        :key="child.id || `${task.id}-${index}`"
        :task="child"
        :depth="depth + 1"
        @toggle="(id, completed) => emit('toggle', id, completed)"
        @remove="(id) => emit('remove', id)"
        @decompose="(id, text) => emit('decompose', id, text)"
        @edit="(id, newText) => emit('edit', id, newText)"
        @add-under="(parentId, text) => emit('add-under', parentId, text)"
      />
    </ul>
    <div v-if="adding" class="add-row" :style="{ marginLeft: `${(depth + 1) * 14 + 22}px` }">
      <input
        ref="addInputRef"
        v-model="addDraft"
        class="add-input"
        type="text"
        aria-label="新增步骤"
        @keydown="onAddKeydown"
        @blur="commitAdd"
      />
    </div>
  </li>
</template>

<style scoped>
.task-item {
  padding: 8px 10px;
  background: var(--bg-soft);
  border: 1px solid transparent;
  border-radius: 8px;
}

.task-item:hover,
.task-item.editing,
.task-item.adding,
.task-item:has(.row:focus-visible) {
  border-color: var(--border);
}

.task-item.done .text {
  color: var(--text-muted);
  text-decoration: line-through;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  outline: none;
  border-radius: 6px;
}

.row:focus-visible {
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.check {
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 1.5px solid var(--text-muted);
  border-radius: 3px;
  flex-shrink: 0;
  background: var(--bg-elevated);
  padding: 0;
}

.check:hover:not(:disabled) {
  border-color: var(--accent);
}

.check.on {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: inset 0 0 0 2px var(--bg-elevated);
}

.check:disabled {
  opacity: 0.5;
  cursor: default;
}

.content {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
  cursor: text;
}

.edit-input {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  margin: -2px 0;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  outline: none;
  color: var(--text);
}

.edit-input:focus {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--blue-200));
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.progress {
  font-size: 11px;
  color: var(--accent);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.decompose-btn {
  flex-shrink: 0;
  padding: 0 5px;
  height: 18px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 650;
  color: var(--text-muted);
  opacity: 0;
}

.task-item:hover .decompose-btn,
.task-item:has(.row:focus-visible) .decompose-btn {
  opacity: 1;
}

.decompose-btn:hover {
  color: var(--text);
  background: var(--accent-soft);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 0 22px;
  font-size: 11px;
  color: var(--text-muted);
}

.due {
  color: var(--due);
}

.tag {
  opacity: 0.9;
}

.children {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.add-row {
  margin-top: 6px;
}

.add-input {
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px dashed var(--border-strong);
  background: var(--bg-elevated);
  outline: none;
  color: var(--text);
  font-size: 12px;
}

.add-input:focus {
  border-style: solid;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--blue-200));
  box-shadow: 0 0 0 3px var(--accent-soft);
}
</style>
