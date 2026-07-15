<script setup lang="ts">
import { computed, ref } from "vue";
import { buildTagChips, buildTagSections, toISODate } from "../core/schedule";
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
const todayIso = toISODate(new Date());

const tagChips = computed(() => buildTagChips(props.tasks));
const allSections = computed(() => buildTagSections(props.tasks));

const sections = computed(() => {
  if (!selectedTag.value) return allSections.value;
  return allSections.value.filter((s) => s.id === `tag-${selectedTag.value}`);
});

const hasTags = computed(() => tagChips.value.length > 0);
const hasContent = computed(() => allSections.value.length > 0);

function selectTag(tag: string) {
  selectedTag.value = selectedTag.value === tag ? null : tag;
}
</script>

<template>
  <div v-if="hasContent" class="tags-wrap">
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

    <div class="tags-list">
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

.tag-strip {
  display: flex;
  gap: 4px;
  padding: 0 1px;
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
  padding-right: 2px;
}

.tag-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
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

.empty-tags {
  flex: 1;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  align-items: center;
  line-height: 1.5;
}
</style>
