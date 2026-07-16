<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import type { ScheduleTask } from "../core/schedule";
import { isOverdue, overdueDays } from "../core/schedule";
import { taskProgress } from "../core/parser";
import ScheduleNode from "./ScheduleNode.vue";

const props = defineProps<{
  task: ScheduleTask;
  depth?: number;
  todayIso?: string;
}>();

const emit = defineEmits<{
  toggle: [id: string, completed: boolean];
  remove: [id: string];
  decompose: [id: string, text: string];
  edit: [id: string, newText: string];
  "add-under": [parentId: string, text: string];
}>();

const depth = computed(() => props.depth ?? 0);
const progress = computed(() => taskProgress(props.task));
const today = computed(() => {
  if (!props.todayIso) return new Date();
  const [y, m, d] = props.todayIso.split("-").map(Number);
  return new Date(y, m - 1, d);
});
const taskOverdue = computed(
  () => !!props.task.due && !props.task.completed && isOverdue(props.task.due, today.value),
);
const taskOverdueDays = computed(() =>
  props.task.due ? overdueDays(props.task.due, today.value) : 0,
);
const editing = ref(false);
const adding = ref(false);
const draft = ref("");
const addDraft = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const addInputRef = ref<HTMLInputElement | null>(null);
const rowRef = ref<HTMLElement | null>(null);

function onToggle() {
  if (!props.task.id || editing.value || adding.value) return;
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

function commitEdit() {
  if (!editing.value || !props.task.id) return;
  const next = draft.value.trim();
  editing.value = false;
  if (!next || next === props.task.text) return;
  emit("edit", props.task.id, next);
}

function cancelEdit() {
  editing.value = false;
  draft.value = props.task.text;
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
  if ((e.key === "d" || e.key === "D") && isModKey(e) && e.shiftKey) {
    e.preventDefault();
    onDecompose();
    return;
  }
  if (e.key === "Backspace" || e.key === "Delete") {
    e.preventDefault();
    onRemove();
  }
}
</script>

<template>
  <li class="node" :class="{ done: task.completed, nested: depth > 0, overdue: taskOverdue, editing, adding }">
    <p v-if="task.parentPath && depth === 0" class="path">{{ task.parentPath }}</p>
    <div
      ref="rowRef"
      class="row"
      :class="{ overdue: taskOverdue }"
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
        :disabled="editing || adding"
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
        <span v-else class="text" @click.stop="startEdit">{{ task.text || "(无标题)" }}</span>
        <span v-if="progress && !editing" class="progress">
          {{ progress.done }}/{{ progress.total }}
        </span>
        <button
          v-if="!editing && !adding"
          type="button"
          class="decompose-btn"
          title="AI 拆解"
          aria-label="AI 拆解任务"
          @click.stop="onDecompose"
        >
          拆
        </button>
      </div>
      <span v-if="task.due && !editing" class="due" :class="{ overdue: taskOverdue }">
        {{ task.due }}
        <template v-if="taskOverdue"> · 过期 {{ taskOverdueDays }} 天</template>
      </span>
    </div>
    <ul v-if="task.children.length" class="children">
      <ScheduleNode
        v-for="(child, index) in task.children"
        :key="child.id || `${task.id}-${index}`"
        :task="child"
        :depth="depth + 1"
        :today-iso="todayIso"
        @toggle="(id, completed) => emit('toggle', id, completed)"
        @remove="(id) => emit('remove', id)"
        @decompose="(id, text) => emit('decompose', id, text)"
        @edit="(id, newText) => emit('edit', id, newText)"
        @add-under="(parentId, text) => emit('add-under', parentId, text)"
      />
    </ul>
    <div v-if="adding" class="add-row">
      <input
        ref="addInputRef"
        v-model="addDraft"
        class="add-input"
        type="text"
        aria-label="新增步骤"
        placeholder="新增一步…"
        @keydown="onAddKeydown"
        @blur="commitAdd"
      />
    </div>
  </li>
</template>

<style scoped>
.node {
  list-style: none;
}

.node.nested {
  margin-left: 12px;
  padding-left: 10px;
  border-left: 1.5px solid color-mix(in srgb, var(--border) 80%, transparent);
}

.path {
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 4px 0 22px;
  opacity: 0.85;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  outline: none;
}

.row:hover,
.row:focus-visible,
.node.editing .row,
.node.adding .row {
  background: color-mix(in srgb, var(--accent-soft) 55%, transparent);
}

.node.done .text {
  color: var(--text-muted);
  text-decoration: line-through;
}

.check {
  width: 13px;
  height: 13px;
  border: 1.5px solid var(--text-muted);
  border-radius: 3px;
  flex-shrink: 0;
  background: var(--bg-elevated);
  padding: 0;
}

.check.on {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: inset 0 0 0 2px var(--bg-elevated);
}

.content {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.text {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  word-break: break-word;
  cursor: text;
}

.edit-input {
  flex: 1;
  min-width: 0;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 12.5px;
}

.progress {
  font-size: 10px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.decompose-btn {
  flex-shrink: 0;
  padding: 0 5px;
  height: 18px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 650;
  color: var(--text-muted);
  opacity: 0.55;
}

.row:hover .decompose-btn,
.row:focus-visible .decompose-btn {
  opacity: 1;
}

.decompose-btn:hover {
  color: var(--text);
  background: var(--accent-soft);
}

.row.overdue {
  border-left: 2.5px solid var(--danger, #c0392b);
  padding-left: 4px;
  margin-left: -2px;
}

.node.overdue .text {
  color: var(--danger, #c0392b);
}

.due {
  font-size: 10px;
  color: var(--due);
  white-space: nowrap;
  flex-shrink: 0;
}

.due.overdue {
  color: var(--danger, #c0392b);
}

.children {
  list-style: none;
  display: flex;
  flex-direction: column;
  margin-top: 1px;
}

.add-row {
  margin-left: 12px;
  padding: 2px 6px 6px 22px;
}

.add-input {
  width: 100%;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 12.5px;
}
</style>
