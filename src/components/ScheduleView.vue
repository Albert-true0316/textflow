<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  buildScheduleSections,
  buildWeekDayChips,
  buildWeekScheduleSections,
  toISODate,
  type ScheduleLayoutMode,
} from "../core/schedule";
import type { Task } from "../core/types";
import ScheduleNode from "./ScheduleNode.vue";

const STORAGE_KEY = "textflow-schedule-layout";

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

function loadLayout(): ScheduleLayoutMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "week" || v === "summary") return v;
  } catch {
    /* ignore */
  }
  return "summary";
}

const layout = ref<ScheduleLayoutMode>(loadLayout());
/** 本周日期条选中的日；null = 整周 */
const selectedDay = ref<string | null>(null);
const today = new Date();
const todayIso = toISODate(today);
const scheduleRef = ref<HTMLElement | null>(null);

const weekChips = computed(() => buildWeekDayChips(props.tasks, today));

const allSections = computed(() =>
  layout.value === "week"
    ? buildWeekScheduleSections(props.tasks, today)
    : buildScheduleSections(props.tasks, today),
);

const sections = computed(() => {
  if (layout.value !== "week" || !selectedDay.value) return allSections.value;
  return allSections.value.filter((s) => s.id === `week-${selectedDay.value}`);
});

const hasContent = computed(() => {
  if (layout.value === "week") return true;
  return allSections.value.length > 0;
});

function setLayout(mode: ScheduleLayoutMode) {
  layout.value = mode;
  if (mode !== "week") selectedDay.value = null;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function selectDay(iso: string) {
  selectedDay.value = selectedDay.value === iso ? null : iso;
}

async function scrollToTarget() {
  if (layout.value !== "week") return;
  await nextTick();
  const root = scheduleRef.value;
  if (!root) return;

  if (selectedDay.value) {
    const el = root.querySelector<HTMLElement>(`[data-day="${selectedDay.value}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }

  const todayEl = root.querySelector<HTMLElement>('[data-today="true"]');
  todayEl?.scrollIntoView({ block: "start", behavior: "smooth" });
}

watch(layout, () => {
  void scrollToTarget();
});

watch(selectedDay, () => {
  void scrollToTarget();
});

onMounted(() => {
  void scrollToTarget();
});
</script>

<template>
  <div v-if="hasContent" class="schedule-wrap">
    <div class="layout-tabs" role="tablist" aria-label="日程展示方式">
      <button
        type="button"
        role="tab"
        class="layout-tab"
        :class="{ active: layout === 'summary' }"
        :aria-selected="layout === 'summary'"
        @click="setLayout('summary')"
      >
        按日
      </button>
      <button
        type="button"
        role="tab"
        class="layout-tab"
        :class="{ active: layout === 'week' }"
        :aria-selected="layout === 'week'"
        @click="setLayout('week')"
      >
        本周
      </button>
    </div>

    <div
      v-if="layout === 'week'"
      class="week-strip"
      role="toolbar"
      aria-label="本周日期筛选"
    >
      <button
        type="button"
        class="day-chip all-chip"
        :class="{ active: selectedDay === null }"
        :aria-pressed="selectedDay === null"
        title="显示整周"
        @click="selectedDay = null"
      >
        全部
      </button>
      <button
        v-for="chip in weekChips"
        :key="chip.iso"
        type="button"
        class="day-chip"
        :class="{
          active: selectedDay === chip.iso,
          today: chip.isToday,
          has: chip.count > 0,
        }"
        :aria-pressed="selectedDay === chip.iso"
        :title="`${chip.weekday} ${chip.day}日${chip.count ? ` · ${chip.count} 项` : ''}`"
        @click="selectDay(chip.iso)"
      >
        <span class="chip-wd">{{ chip.weekday }}</span>
        <span class="chip-day">{{ chip.day }}</span>
        <span v-if="chip.count" class="chip-dot" aria-hidden="true" />
      </button>
    </div>

    <div ref="scheduleRef" class="schedule">
      <section
        v-for="sec in sections"
        :key="sec.id"
        class="schedule-section"
        :class="{ overdue: sec.overdue, today: sec.isToday }"
        :data-today="sec.isToday ? 'true' : undefined"
        :data-day="sec.id.startsWith('week-') ? sec.id.slice(5) : undefined"
      >
        <h3 class="section-title">{{ sec.title }}</h3>
        <p v-if="sec.empty" class="empty-day">无任务</p>
        <ul v-else class="tree">
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
  <p v-else class="empty-schedule">
    没有可排程的任务（给任务加上 🗓️ 日期，或底部用自然语言说「明天…」）
  </p>
</template>

<style scoped>
.schedule-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.layout-tabs {
  display: flex;
  gap: 4px;
  padding: 0 12px;
  flex-shrink: 0;
}

.layout-tab {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
}

.layout-tab:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent-soft) 45%, transparent);
}

.layout-tab.active {
  color: var(--text);
  background: var(--accent-soft);
}

.week-strip {
  display: flex;
  gap: 3px;
  padding: 0 12px;
  flex-shrink: 0;
  overflow-x: auto;
}

.day-chip {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 4px 2px 6px;
  border-radius: 7px;
  color: var(--text-muted);
  background: transparent;
  font-variant-numeric: tabular-nums;
}

.all-chip {
  font-size: 11px;
  font-weight: 600;
  justify-content: center;
  gap: 0;
}

.day-chip:hover {
  background: color-mix(in srgb, var(--accent-soft) 40%, transparent);
  color: var(--text);
}

.day-chip.active {
  background: var(--accent-soft);
  color: var(--text);
}

.day-chip.today .chip-day {
  color: var(--accent);
  font-weight: 700;
}

.day-chip.active.today .chip-day {
  color: var(--accent);
}

.chip-wd {
  font-size: 9px;
  line-height: 1.2;
  opacity: 0.85;
}

.chip-day {
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
}

.chip-dot {
  position: absolute;
  bottom: 3px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.75;
}

.day-chip.active .chip-dot {
  background: var(--accent);
  opacity: 1;
}

.schedule {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-left: 12px;
}

.schedule-section {
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

.schedule-section.overdue .section-title {
  color: var(--danger, #c0392b);
}

.schedule-section.today .section-title {
  color: var(--accent);
}

.tree {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.empty-day {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.65;
  padding: 2px 4px 4px 22px;
}

.empty-schedule {
  flex: 1;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  align-items: center;
  line-height: 1.5;
  padding: 0 12px;
}
</style>
