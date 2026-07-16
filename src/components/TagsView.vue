<script setup lang="ts">
import { computed, ref } from "vue";
import {
  buildTagChips,
  buildTagSections,
  filterSectionsByStatus,
  toISODate,
  type TaskStatusFilter,
} from "../core/schedule";
import type { Task } from "../core/types";
import ScheduleNode from "./ScheduleNode.vue";

const props = defineProps<{
  tasks: Task[];
}>();

const emit = defineEmits<{
  toggle: [id: string, completed: boolean];
  remove: [id: string];
  decompose: [id: string, text: string];
  edit: [id: string, newText: string];
  "add-under": [parentId: string, text: string];
}>();

/** 选中的标签；null = 全部 */
const selectedTag = ref<string | null>(null);
const statusFilter = ref<TaskStatusFilter>("all");
const today = new Date();
const todayIso = toISODate(today);

const STATUS_OPTIONS: { id: TaskStatusFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "open", label: "未完成" },
  { id: "overdue", label: "已过期" },
  { id: "done", label: "已完成" },
];

const tagChips = computed(() => buildTagChips(props.tasks));
const allSections = computed(() => buildTagSections(props.tasks));

const sections = computed(() => {
  let list = allSections.value;
  if (selectedTag.value) {
    list = list.filter((s) => s.id === `tag-${selectedTag.value}`);
  }
  return filterSectionsByStatus(list, statusFilter.value, today);
});

const hasTags = computed(() => tagChips.value.length > 0);
const hasAnyTasks = computed(() => allSections.value.length > 0);
const hasFiltered = computed(() => sections.value.length > 0);

function selectTag(tag: string) {
  selectedTag.value = selectedTag.value === tag ? null : tag;
}
</script>

<template>
  <div v-if="hasAnyTasks" class="tags-wrap">
    <div
      class="status-tabs"
      role="tablist"
      aria-label="按状态筛选"
    >
      <button
        v-for="opt in STATUS_OPTIONS"
        :key="opt.id"
        type="button"
        role="tab"
        class="status-tab"
        :class="{ active: statusFilter === opt.id, danger: opt.id === 'overdue' }"
        :aria-selected="statusFilter === opt.id"
        @click="statusFilter = opt.id"
      >
        {{ opt.label }}
      </button>
    </div>

    <div
      v-if="hasTags"
      class="tag-strip"
      role="toolbar"
      aria-label="按标签筛选"
    >
      <button
        type="button"
        class="tag-chip all-chip"
        :class="{ active: selectedTag === null }"
        :aria-pressed="selectedTag === null"
        title="显示全部分类"
        @click="selectedTag = null"
      >
        全部
      </button>
      <button
        v-for="chip in tagChips"
        :key="chip.tag"
        type="button"
        class="tag-chip"
        :class="{ active: selectedTag === chip.tag }"
        :aria-pressed="selectedTag === chip.tag"
        :title="`#${chip.tag} · ${chip.count} 项`"
        @click="selectTag(chip.tag)"
      >
        <span class="chip-label">#{{ chip.tag }}</span>
        <span class="chip-count">{{ chip.count }}</span>
      </button>
    </div>

    <div v-if="hasFiltered" class="tags-list">
      <section
        v-for="sec in sections"
        :key="sec.id"
        class="tag-section"
      >
        <h3 class="section-title">{{ sec.title }}</h3>
        <ul class="tree">
          <ScheduleNode
            v-for="(task, index) in sec.tasks"
            :key="task.id || `${sec.id}-${index}`"
            :task="task"
            :depth="0"
            :today-iso="todayIso"
            @toggle="(id, completed) => emit('toggle', id, completed)"
            @remove="(id) => emit('remove', id)"
            @decompose="(id, text) => emit('decompose', id, text)"
            @edit="(id, newText) => emit('edit', id, newText)"
            @add-under="(parentId, text) => emit('add-under', parentId, text)"
          />
        </ul>
      </section>
    </div>
    <p v-else class="empty-filter">当前筛选下没有任务</p>
  </div>
  <p v-else class="empty-tags">
    还没有带标签的任务（在任务末尾加 #生活、#工作 等即可）
  </p>
</template>

<style scoped>
.tags-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-tabs {
  display: flex;
  gap: 4px;
  padding: 0 12px;
  flex-shrink: 0;
}

.status-tab {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
}

.status-tab:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent-soft) 45%, transparent);
}

.status-tab.active {
  color: var(--text);
  background: var(--accent-soft);
}

.status-tab.danger.active {
  color: var(--danger, #c0392b);
  background: color-mix(in srgb, var(--danger, #c0392b) 12%, transparent);
}

.tag-strip {
  display: flex;
  gap: 4px;
  padding: 0 12px;
  flex-shrink: 0;
  overflow-x: auto;
}

.tag-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 7px;
  color: var(--text-muted);
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.all-chip {
  padding: 4px 10px;
}

.tag-chip:hover {
  background: color-mix(in srgb, var(--accent-soft) 40%, transparent);
  color: var(--text);
}

.tag-chip.active {
  background: var(--accent-soft);
  color: var(--text);
}

.chip-count {
  font-size: 10px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.tag-chip.active .chip-count {
  opacity: 0.9;
}

.tags-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-left: 12px;
}

.tag-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 12px;
}

.section-title {
  font-size: 11px;
  font-weight: 650;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  padding: 0 2px 4px;
}

.tree {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.empty-tags,
.empty-filter {
  flex: 1;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  align-items: center;
  line-height: 1.5;
  padding: 0 12px;
}
</style>
