<script setup lang="ts">
import type { Task } from "../core/types";
import TaskItem from "./TaskItem.vue";

defineProps<{
  tasks: Task[];
}>();

const emit = defineEmits<{
  toggle: [id: string, completed: boolean];
  remove: [id: string];
  decompose: [id: string, text: string];
  edit: [id: string, newText: string];
  "add-under": [parentId: string, text: string];
}>();
</script>

<template>
  <ul v-if="tasks.length" class="task-list">
    <TaskItem
      v-for="(task, index) in tasks"
      :key="task.id || `root-${index}`"
      :task="task"
      @toggle="(id, completed) => emit('toggle', id, completed)"
      @remove="(id) => emit('remove', id)"
      @decompose="(id, text) => emit('decompose', id, text)"
      @edit="(id, newText) => emit('edit', id, newText)"
      @add-under="(parentId, text) => emit('add-under', parentId, text)"
    />
  </ul>
  <p v-else class="empty-tasks">这个文件里还没有任务（`- [ ]`）</p>
</template>

<style scoped>
.task-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.empty-tasks {
  flex: 1;
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  align-items: center;
}
</style>
