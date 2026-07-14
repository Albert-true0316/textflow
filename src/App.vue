<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SettingsPanel from "./components/SettingsPanel.vue";
import TaskList from "./components/TaskList.vue";
import { useAi } from "./composables/useAi";
import { usePlatform } from "./composables/usePlatform";
import { useTheme } from "./composables/useTheme";
import { useTodoFile } from "./composables/useTodoFile";
import type { ProviderId } from "./core/ai/providers";
import type { ThemeMode } from "./theme/theme";

const collapsed = ref(false);
const alwaysOnTop = ref(true);
const zoomed = ref(false);
const expandedHeight = ref(480);
const COLLAPSED_HEIGHT = 46;
const NORMAL_HEIGHT = 480;
const ZOOM_HEIGHT = 640;
const menuOpen = ref(false);
const menuPopoverRef = ref<HTMLElement | null>(null);
const menuButtonRef = ref<HTMLElement | null>(null);

const { isMac } = usePlatform();
const { themeMode, updateThemeMode } = useTheme();

const {
  filePath,
  fileName,
  tasks,
  error,
  binding,
  writing,
  canUndo,
  bindMarkdownFile,
  clearBinding,
  toggleTask,
  addTask,
  deleteTask,
  editTask,
  undo,
  runOps,
} = useTodoFile();

const {
  PROVIDERS,
  settings,
  hasKey,
  settingsOpen,
  keyDraft,
  keySaveHint,
  aiBusy,
  aiError,
  pendingOps,
  pendingRejected,
  previewEnabled,
  decomposeCount,
  providerId,
  hasPending,
  activeProvider,
  endpointHint,
  openSettings,
  closeSettings,
  onProviderChange,
  updateCustomBaseUrl,
  updateModel,
  updateDecomposeCount,
  setPreviewEnabled,
  saveKey,
  clearKey,
  clearPending,
  summarizePending,
  proposeFromNaturalLanguage,
  decomposePrompt,
  ensureApiKeyReady,
} = useAi();

const draft = ref("");
const displayError = computed(() => error.value || aiError.value);
const pendingLines = computed(() => summarizePending(tasks.value));

function openMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return;
  const target = event.target as Node;
  if (menuPopoverRef.value?.contains(target)) return;
  if (menuButtonRef.value?.contains(target)) return;
  closeMenu();
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
  } else {
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  }
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
});

async function openSettingsFromMenu() {
  menuOpen.value = false;
  await openSettings();
}

async function submitDraft() {
  if (!filePath.value || writing.value || aiBusy.value) return;
  const text = draft.value.trim();
  if (!text) return;

  if (!hasKey.value) {
    draft.value = "";
    await addTask(text);
    return;
  }

  draft.value = "";
  const result = await proposeFromNaturalLanguage(text, tasks.value);
  if (Array.isArray(result)) {
    await runOps(result, "AI 操作");
  }
}

async function addManually() {
  if (!filePath.value || writing.value) return;
  const text = draft.value;
  draft.value = "";
  await addTask(text);
}

async function addUnderTask(parentId: string, text: string) {
  await addTask(text, parentId);
}

async function applyPending() {
  const ops = [...pendingOps.value];
  clearPending();
  if (!ops.length) return;
  await runOps(ops, "AI 操作");
}

async function decomposeTask(id: string, text: string) {
  if (!(await ensureApiKeyReady())) {
    await openSettings();
    return;
  }
  const utterance = decomposePrompt(id, text);
  const result = await proposeFromNaturalLanguage(utterance, tasks.value, {
    forceDecomposeId: id,
  });
  if (Array.isArray(result)) {
    await runOps(result, "AI 拆解");
  }
}

async function onProviderSelect(id: ProviderId) {
  await onProviderChange(id);
}

function onThemeSelect(mode: ThemeMode) {
  updateThemeMode(mode);
}

async function toggleMiniPlayer() {
  const win = getCurrentWindow();
  const size = await win.innerSize();
  const scale = await win.scaleFactor();
  const logicalWidth = size.width / scale;
  const logicalHeight = size.height / scale;

  if (!collapsed.value) {
    expandedHeight.value = Math.max(logicalHeight, 200);
    collapsed.value = true;
    menuOpen.value = false;
    await nextTick();
    await win.setMinSize(new LogicalSize(280, 44));
    await win.setSize(new LogicalSize(logicalWidth, COLLAPSED_HEIGHT));
  } else {
    collapsed.value = false;
    await nextTick();
    await win.setMinSize(new LogicalSize(280, 120));
    const h = zoomed.value ? ZOOM_HEIGHT : expandedHeight.value || NORMAL_HEIGHT;
    await win.setSize(new LogicalSize(logicalWidth, h));
  }
}

async function minimizeToDock() {
  await getCurrentWindow().minimize();
}

async function toggleZoom() {
  const win = getCurrentWindow();
  if (collapsed.value) {
    await toggleMiniPlayer();
    return;
  }
  const size = await win.innerSize();
  const scale = await win.scaleFactor();
  const logicalWidth = size.width / scale;
  zoomed.value = !zoomed.value;
  const h = zoomed.value ? ZOOM_HEIGHT : NORMAL_HEIGHT;
  expandedHeight.value = h;
  await win.setSize(new LogicalSize(logicalWidth, h));
}

async function togglePin() {
  const win = getCurrentWindow();
  alwaysOnTop.value = !alwaysOnTop.value;
  await win.setAlwaysOnTop(alwaysOnTop.value);
}

async function closeToTray() {
  await getCurrentWindow().hide();
}
</script>

<template>
  <div class="widget" :class="{ collapsed, 'is-windows': !isMac }">
    <header
      class="titlebar glass"
      :class="{ 'titlebar-mac': isMac, 'titlebar-win': !isMac }"
      data-tauri-drag-region
    >
      <div v-if="isMac" class="traffic-lights" @pointerdown.stop>
        <button
          type="button"
          class="tl tl-close"
          title="关闭（保留到菜单栏托盘）"
          aria-label="关闭"
          @click="closeToTray"
        >
          <span class="tl-glyph">×</span>
        </button>
        <button
          type="button"
          class="tl tl-min"
          title="最小化到程序坞"
          aria-label="最小化到程序坞"
          @click="minimizeToDock"
        >
          <span class="tl-glyph">−</span>
        </button>
        <button
          type="button"
          class="tl tl-zoom"
          :title="collapsed ? '退出迷你模式' : zoomed ? '还原大小' : '放大'"
          :aria-label="collapsed ? '退出迷你模式' : zoomed ? '还原大小' : '放大'"
          @click="toggleZoom"
        >
          <span class="tl-glyph">+</span>
        </button>
      </div>

      <div class="brand" data-tauri-drag-region>
        <span class="name">TextFlow</span>
      </div>

      <div class="titlebar-right" @pointerdown.stop>
        <button
          type="button"
          class="chrome-btn"
          :class="{ on: collapsed }"
          :title="collapsed ? '退出迷你模式' : '迷你模式'"
          :aria-pressed="collapsed"
          aria-label="迷你模式"
          @click="toggleMiniPlayer"
        >
          Mini
        </button>
        <button
          v-show="!collapsed"
          type="button"
          class="chrome-btn"
          :class="{ on: alwaysOnTop }"
          :title="alwaysOnTop ? '取消置顶' : '置顶'"
          :aria-pressed="alwaysOnTop"
          @click="togglePin"
        >
          Pin
        </button>
        <button
          v-show="!collapsed"
          ref="menuButtonRef"
          type="button"
          class="chrome-btn"
          :class="{ on: menuOpen || settingsOpen }"
          title="菜单"
          aria-label="菜单"
          @click="openMenu"
        >
          ☰
        </button>
        <div v-if="!isMac" class="win-controls">
          <button
            type="button"
            class="win-btn"
            title="最小化"
            aria-label="最小化"
            @click="minimizeToDock"
          >
            <span aria-hidden="true">─</span>
          </button>
          <button
            type="button"
            class="win-btn"
            :title="collapsed ? '退出迷你模式' : zoomed ? '还原' : '最大化'"
            :aria-label="collapsed ? '退出迷你模式' : zoomed ? '还原' : '最大化'"
            @click="toggleZoom"
          >
            <span aria-hidden="true">{{ zoomed && !collapsed ? "❐" : "□" }}</span>
          </button>
          <button
            type="button"
            class="win-btn win-close"
            title="关闭到托盘"
            aria-label="关闭到托盘"
            @click="closeToTray"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
    </header>

    <div
      v-if="menuOpen && !collapsed"
      ref="menuPopoverRef"
      class="menu-popover glass-strong"
      @pointerdown.stop
    >
      <button type="button" class="menu-item" @click="openSettingsFromMenu">
        设置…
      </button>
      <button
        type="button"
        class="menu-item"
        :disabled="binding"
        @click="menuOpen = false; bindMarkdownFile()"
      >
        {{ filePath ? "更换 Markdown…" : "打开 Markdown…" }}
      </button>
      <button
        v-if="filePath"
        type="button"
        class="menu-item"
        :disabled="!canUndo || writing"
        @click="menuOpen = false; undo()"
      >
        撤销上一次写入
      </button>
    </div>

    <main v-show="!collapsed" class="body">
      <SettingsPanel
        v-if="settingsOpen"
        :provider-id="providerId"
        :providers="PROVIDERS"
        :key-draft="keyDraft"
        :has-key="hasKey"
        :key-save-hint="keySaveHint"
        :preview-enabled="previewEnabled"
        :decompose-count="decomposeCount"
        :custom-base-url="settings.customBaseUrl"
        :model="settings.model"
        :endpoint-model="endpointHint.model"
        :endpoint-url="endpointHint.url"
        :provider-editable-url="!!activeProvider.editableUrl"
        :provider-hint="activeProvider.hint"
        :theme-mode="themeMode"
        @update:key-draft="keyDraft = $event"
        @update:provider-id="onProviderSelect"
        @update:custom-base-url="updateCustomBaseUrl"
        @update:model="updateModel"
        @update:decompose-count="updateDecomposeCount"
        @update:preview-enabled="setPreviewEnabled"
        @update:theme-mode="onThemeSelect"
        @save-key="saveKey"
        @clear-key="clearKey"
        @close="closeSettings"
      />

      <div class="toolbar">
        <button
          type="button"
          class="text-btn"
          :disabled="binding"
          @click="bindMarkdownFile"
        >
          {{ filePath ? "换文件" : "打开 .md" }}
        </button>
        <span v-if="fileName" class="file-name" :title="filePath ?? undefined">
          {{ fileName }}
        </span>
        <button
          v-if="filePath"
          type="button"
          class="text-btn muted"
          title="撤销上一次写操作"
          :disabled="!canUndo || writing"
          @click="undo"
        >
          撤销
        </button>
        <button
          v-if="filePath"
          type="button"
          class="text-btn muted"
          title="解除绑定"
          @click="clearBinding"
        >
          清除
        </button>
      </div>

      <p v-if="displayError" class="error">{{ displayError }}</p>

      <div v-if="hasPending" class="preview">
        <p class="preview-title">将执行以下操作</p>
        <ul>
          <li v-for="(line, i) in pendingLines" :key="i">{{ line }}</li>
        </ul>
        <p v-if="pendingRejected.length" class="hint">
          已忽略：{{ pendingRejected.join("；") }}
        </p>
        <div class="preview-actions">
          <button type="button" class="text-btn" :disabled="writing" @click="applyPending">
            应用
          </button>
          <button type="button" class="text-btn muted" @click="clearPending">取消</button>
        </div>
      </div>

      <TaskList
        v-if="filePath"
        :tasks="tasks"
        @toggle="toggleTask"
        @remove="deleteTask"
        @decompose="decomposeTask"
        @edit="editTask"
        @add-under="addUnderTask"
      />

      <div v-else class="empty">
        <p>选择一份本地 Markdown 作为任务库</p>
        <p class="hint">说人话就行，例如「买菜搞定了，加个周五交报告」</p>
      </div>

      <div class="composer">
        <input
          v-model="draft"
          type="text"
          :placeholder="
            !filePath
              ? '先打开 .md 文件'
              : hasKey
                ? '随便说：买菜搞定了 / 帮我拆答辩…'
                : '输入任务，Enter 添加顶层'
          "
          :disabled="!filePath || writing || aiBusy"
          :aria-label="hasKey ? '自然语言输入' : '新增任务'"
          @keydown.enter.prevent="submitDraft"
        />
        <button
          v-if="filePath && hasKey"
          type="button"
          class="text-btn composer-add"
          title="手动新增任务"
          :disabled="writing || aiBusy || !draft.trim()"
          @click="addManually"
        >
          添加
        </button>
      </div>
      <p v-if="aiBusy" class="hint">AI 理解中…</p>
    </main>
  </div>
</template>

<style scoped>
.widget {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background:
    radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--blue) 10%, transparent), transparent 55%),
    linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  color: var(--text);
}

.widget.collapsed {
  height: 100%;
  border-radius: 10px;
  box-shadow: var(--shadow-collapsed);
}

.widget.is-windows.collapsed {
  border-radius: 6px;
}

.titlebar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 11px 12px 9px;
  user-select: none;
  cursor: grab;
  flex-shrink: 0;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
  /* 玻璃底由 .glass 提供；这里只留底部分隔高光 */
  border-bottom-color: color-mix(in srgb, var(--glass-border) 80%, transparent);
}

.titlebar:active {
  cursor: grabbing;
}

.traffic-lights {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 1px 0;
  cursor: default;
}

.titlebar-mac {
  grid-template-columns: auto 1fr auto;
}

.titlebar-win {
  grid-template-columns: 1fr auto;
  padding-right: 0;
}

.titlebar-win .brand {
  justify-content: flex-start;
  padding-left: 2px;
}

.titlebar-win .titlebar-right {
  min-width: 0;
  gap: 2px;
}

.win-controls {
  display: flex;
  align-items: stretch;
  margin: -11px -12px -9px 6px;
  height: calc(100% + 20px);
}

.win-btn {
  width: 44px;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--text-muted);
  border-radius: 0;
  transition: background 0.12s ease, color 0.12s ease;
}

.win-btn:hover {
  background: var(--win-btn-hover);
  color: var(--text);
}

.win-btn.win-close:hover {
  background: #e81123;
  color: #fff;
}

[data-theme="dark"] .win-btn.win-close:hover {
  background: #c42b1c;
  color: #fff;
}

.tl {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  position: relative;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
  transition: filter 0.12s ease;
}

.tl-close {
  background: var(--tl-close);
  box-shadow: inset 0 0 0 0.5px var(--tl-close-border);
}

.tl-min {
  background: var(--tl-min);
  box-shadow: inset 0 0 0 0.5px var(--tl-min-border);
}

.tl-zoom {
  background: var(--tl-zoom);
  box-shadow: inset 0 0 0 0.5px var(--tl-zoom-border);
}

.tl-glyph {
  font-size: 9px;
  line-height: 1;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.55);
  opacity: 0;
  transform: translateY(-0.5px);
  pointer-events: none;
}

.traffic-lights:hover .tl-glyph {
  opacity: 1;
}

.tl:hover {
  filter: brightness(0.96);
}

.tl:active {
  filter: brightness(0.9);
}

.brand {
  display: flex;
  justify-content: center;
  min-width: 0;
}

.name {
  font-weight: 650;
  letter-spacing: 0.03em;
  font-size: 12px;
  color: var(--text);
}

.titlebar-right {
  min-width: 52px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  position: relative;
}

.menu-popover {
  position: absolute;
  top: 42px;
  right: 10px;
  z-index: 20;
  min-width: 168px;
  padding: 6px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  text-align: left;
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text);
}

.menu-item:hover:not(:disabled) {
  background: var(--accent-soft);
}

.menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chrome-btn {
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  border: 1px solid transparent;
}

.chrome-btn:hover,
.chrome-btn.on {
  color: var(--text);
  background: var(--accent-soft);
}

.chrome-btn.on {
  border-color: var(--border);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 12px 12px;
  min-height: 0;
  flex: 1;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.text-btn {
  padding: 5px 9px;
  border-radius: 7px;
  background: var(--accent-soft);
  color: var(--text);
  font-size: 12px;
  white-space: nowrap;
  border: 1px solid transparent;
}

.text-btn:hover:not(:disabled) {
  border-color: var(--border);
  background: color-mix(in srgb, var(--blue-100) 55%, var(--white));
}

.text-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.text-btn.muted {
  color: var(--text-muted);
  background: transparent;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 12px;
}

.hint {
  color: var(--text-muted);
  font-size: 12px;
}

.error {
  color: var(--danger);
  font-size: 12px;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.empty code {
  font-size: 11px;
  color: var(--text);
  opacity: 0.9;
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.preview {
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--blue-100) 45%, var(--white));
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-title {
  font-weight: 650;
  font-size: 12px;
}

.preview ul {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.composer {
  display: flex;
  gap: 8px;
  align-items: center;
}

.composer input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  outline: none;
  color: var(--text);
}

.composer input::placeholder {
  color: var(--text-muted);
}

.composer input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--bg-soft);
}

.composer-add {
  flex-shrink: 0;
}
</style>
