<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SettingsPanel from "./components/SettingsPanel.vue";
import ScheduleView from "./components/ScheduleView.vue";
import TagsView from "./components/TagsView.vue";
import { useAi } from "./composables/useAi";
import { usePlatform } from "./composables/usePlatform";
import { useTheme } from "./composables/useTheme";
import { useTodoFile } from "./composables/useTodoFile";
import { flattenTasks } from "./core/parser";
import {
  applyOrbWindow,
  captureWindowGeometry,
  detectEdgeSide,
  expandBesideOrb,
  nudgeWebviewRepaint,
  ORB_SIZE,
  type OrbSide,
  type WindowGeometry,
} from "./core/edgeOrb";
import type { ProviderId } from "./core/ai/providers";
import type { ThemeMode } from "./theme/theme";

const collapsed = ref(false);
const orb = ref(false);
const orbSide = ref<OrbSide>("right");
const alwaysOnTop = ref(true);
const zoomed = ref(false);
const expandedHeight = ref(480);
const COLLAPSED_HEIGHT = 56;
const NORMAL_HEIGHT = 480;
const ZOOM_HEIGHT = 640;
const menuOpen = ref(false);
const menuPopoverRef = ref<HTMLElement | null>(null);
const menuButtonRef = ref<HTMLButtonElement | null>(null);
const savedBeforeOrb = ref<WindowGeometry | null>(null);
/** 展开后短时抑制再次贴边成球，避免弹回去 */
let orbCooldownUntil = 0;
let edgeMoveTimer: ReturnType<typeof setTimeout> | null = null;
let unlistenMoved: (() => void) | null = null;
let applyingOrb = false;

type ViewMode = "schedule" | "tags";
const VIEW_KEY = "textflow.viewMode";
function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "tags") return "tags";
    // 旧版「列表」与日程汇总重叠，统一落到日程
  } catch {
    /* ignore */
  }
  return "schedule";
}
const viewMode = ref<ViewMode>(loadViewMode());
watch(viewMode, (mode) => {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
});

const { isMac, isWindows } = usePlatform();
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
  if (edgeMoveTimer) clearTimeout(edgeMoveTimer);
  unlistenMoved?.();
});

async function enterOrb(side: OrbSide) {
  if (orb.value || applyingOrb) return;
  if (Date.now() < orbCooldownUntil) return;
  applyingOrb = true;
  try {
    if (!savedBeforeOrb.value) {
      const geo = await captureWindowGeometry();
      if (collapsed.value) {
        geo.height = zoomed.value
          ? ZOOM_HEIGHT
          : expandedHeight.value || NORMAL_HEIGHT;
        geo.width = Math.max(geo.width, 340);
      }
      savedBeforeOrb.value = geo;
    }
    menuOpen.value = false;
    settingsOpen.value = false;
    collapsed.value = true;
    orbSide.value = side;
    orb.value = true;
    await nextTick();
    await applyOrbWindow(side);
  } finally {
    applyingOrb = false;
  }
}

async function expandFromOrb() {
  if (!orb.value) return;
  applyingOrb = true;
  try {
    const geo = savedBeforeOrb.value;
    const side = orbSide.value;
    const width = geo?.width ?? 340;
    const height = zoomed.value
      ? ZOOM_HEIGHT
      : geo?.height || expandedHeight.value || NORMAL_HEIGHT;
    orb.value = false;
    collapsed.value = false;
    savedBeforeOrb.value = null;
    await nextTick();
    await expandBesideOrb({ width, height }, side);
    orbCooldownUntil = Date.now() + 1200;
  } finally {
    applyingOrb = false;
  }
}

/** 拖动时 Tauri 会吃掉 pointer；仅真正点击才展开 */
let orbIgnoreClickUntil = 0;
function onOrbActivate() {
  if (Date.now() < orbIgnoreClickUntil) return;
  void expandFromOrb();
}

function scheduleEdgeCheck() {
  if (orb.value) {
    // 球体被拖动时忽略随后的点击，避免松手立刻展开
    orbIgnoreClickUntil = Date.now() + 280;
  }
  if (edgeMoveTimer) clearTimeout(edgeMoveTimer);
  edgeMoveTimer = setTimeout(() => {
    void checkEdgeSnap();
  }, 160);
}

async function checkEdgeSnap() {
  if (applyingOrb || orb.value) return;
  if (Date.now() < orbCooldownUntil) return;
  try {
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const side = await detectEdgeSide(pos);
    if (side) await enterOrb(side);
  } catch {
    /* 浏览器预览或权限不足时忽略 */
  }
}

onMounted(() => {
  void (async () => {
    try {
      unlistenMoved = await getCurrentWindow().onMoved(() => {
        scheduleEdgeCheck();
      });
    } catch {
      /* ignore */
    }
  })();
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
  const task = flattenTasks(tasks.value).find((t) => t.id === id);
  const utterance = decomposePrompt(id, text, task?.due);
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
  if (orb.value) {
    await expandFromOrb();
    return;
  }

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
    await win.setMinSize(new LogicalSize(280, COLLAPSED_HEIGHT));
    await win.setSize(new LogicalSize(logicalWidth, COLLAPSED_HEIGHT));
    if (isWindows.value) await nudgeWebviewRepaint();
  } else {
    collapsed.value = false;
    await nextTick();
    await win.setMinSize(new LogicalSize(280, 120));
    const h = zoomed.value ? ZOOM_HEIGHT : expandedHeight.value || NORMAL_HEIGHT;
    await win.setSize(new LogicalSize(logicalWidth, h));
    if (isWindows.value) await nudgeWebviewRepaint();
  }
}

async function minimizeToDock() {
  await getCurrentWindow().minimize();
}

async function toggleZoom() {
  const win = getCurrentWindow();
  if (orb.value) {
    await expandFromOrb();
    return;
  }
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
  if (isWindows.value) await nudgeWebviewRepaint();
}

async function togglePin() {
  const win = getCurrentWindow();
  alwaysOnTop.value = !alwaysOnTop.value;
  await win.setAlwaysOnTop(alwaysOnTop.value);
}

async function closeToTray() {
  await getCurrentWindow().hide();
}

async function quitApp() {
  menuOpen.value = false;
  try {
    await invoke("quit_app");
  } catch {
    await getCurrentWindow().close();
  }
}
</script>

<template>
  <div
    class="widget"
    :class="{ collapsed, orb, 'is-windows': isWindows }"
    :style="orb ? { width: `${ORB_SIZE}px`, height: `${ORB_SIZE}px` } : undefined"
  >
    <!-- 贴边球体：拖动移动，轻点展开 -->
    <button
      v-if="orb"
      type="button"
      class="orb-face"
      title="轻点展开 · 按住可拖动"
      aria-label="展开 TextFlow"
      data-tauri-drag-region
      @click="onOrbActivate"
    >
      <img class="orb-icon" src="/app-icon.png" alt="" draggable="false" />
    </button>

    <template v-else>
    <header
      class="titlebar glass"
      :class="{ 'titlebar-mac': isMac, 'titlebar-win': isWindows }"
      data-tauri-drag-region
    >
      <div v-if="isMac" class="traffic-lights" @pointerdown.stop>
        <button
          type="button"
          class="tl tl-close"
          title="隐藏到托盘（不退出；退出请用 ☰ 或菜单栏托盘）"
          aria-label="隐藏到托盘"
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
        <div v-if="isWindows" class="win-controls">
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
            title="隐藏到托盘（不退出；退出请用 ☰ 或托盘菜单）"
            aria-label="隐藏到托盘"
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
      <button
        v-if="filePath"
        type="button"
        class="menu-item muted"
        @click="menuOpen = false; clearBinding()"
      >
        解除绑定
      </button>
      <button type="button" class="menu-item muted" @click="quitApp">
        退出 TextFlow
      </button>
    </div>

    <div
      v-if="settingsOpen && !collapsed && !orb"
      class="settings-backdrop"
      @pointerdown.self="closeSettings"
    >
      <SettingsPanel
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
    </div>

    <div
      v-if="hasPending && !collapsed && !orb"
      class="settings-backdrop preview-backdrop"
      role="dialog"
      aria-label="确认待执行操作"
      @pointerdown.self="clearPending"
    >
      <div class="preview glass-strong" @pointerdown.stop>
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
    </div>

    <main v-show="!collapsed" class="body">
      <div class="toolbar">
        <div v-if="filePath" class="view-tabs" role="tablist" aria-label="视图切换">
          <button
            type="button"
            class="view-tab"
            :class="{ active: viewMode === 'schedule' }"
            role="tab"
            :aria-selected="viewMode === 'schedule'"
            @click="viewMode = 'schedule'"
          >
            日程
          </button>
          <button
            type="button"
            class="view-tab"
            :class="{ active: viewMode === 'tags' }"
            role="tab"
            :aria-selected="viewMode === 'tags'"
            @click="viewMode = 'tags'"
          >
            分类
          </button>
        </div>
        <span
          v-if="fileName"
          class="file-name"
          :title="filePath ?? undefined"
        >
          {{ fileName }}
        </span>
        <span v-else class="file-hint">未打开文件 · ☰ 菜单可绑定</span>
      </div>

      <p v-if="displayError" class="error">{{ displayError }}</p>

      <ScheduleView
        v-if="filePath && viewMode === 'schedule'"
        :tasks="tasks"
        @toggle="toggleTask"
        @remove="deleteTask"
        @decompose="decomposeTask"
        @edit="editTask"
        @add-under="addUnderTask"
      />

      <TagsView
        v-else-if="filePath && viewMode === 'tags'"
        :tasks="tasks"
        @toggle="toggleTask"
        @remove="deleteTask"
        @decompose="decomposeTask"
        @edit="editTask"
        @add-under="addUnderTask"
      />

      <div v-else class="empty">
        <p>尚未绑定任务文件</p>
        <p class="hint">点击右上角 ☰ →「打开 Markdown…」</p>
      </div>

      <div class="composer">
        <input
          v-model="draft"
          type="text"
          :placeholder="
            !filePath
              ? '先打开 .md 文件'
              : hasKey
                ? viewMode === 'tags'
                  ? '说：把交周报标成 #工作…'
                  : '说：明天交报告 / 买菜改到周五…'
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
    </template>
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
  border: none;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  color: var(--text);
}

.widget.collapsed {
  height: 100%;
  border-radius: 18px;
  box-shadow: var(--shadow-collapsed);
}

.widget.is-windows.collapsed {
  border-radius: 14px;
}

.widget.orb {
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  border: none;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

.orb-face {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  overflow: hidden;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--blue-deep) 22%, transparent);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.orb-face:focus,
.orb-face:focus-visible {
  outline: none;
}

.orb-face:hover {
  transform: scale(1.04);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--blue-deep) 18%, transparent);
}

.orb-face:active {
  transform: scale(0.96);
}

.orb-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.widget.collapsed .titlebar {
  padding: 14px 14px;
  border-bottom: none;
  flex: 1;
  align-items: center;
}

.widget.collapsed .name {
  font-size: 13px;
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
  border: none;
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

.settings-backdrop {
  position: absolute;
  inset: 0;
  z-index: 28;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 44px 10px 12px;
  background: color-mix(in srgb, var(--blue-deep) 28%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.preview-backdrop {
  z-index: 29;
  align-items: center;
  padding: 20px 12px;
}

.preview-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.preview {
  width: 100%;
  max-width: 100%;
  max-height: min(70vh, 100%);
  overflow: auto;
  padding: 14px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: var(--glass-shadow);
}

.preview-title {
  font-weight: 650;
  font-size: 13px;
}

.preview ul {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.45;
}

.preview .hint {
  color: var(--text-muted);
  font-size: 11px;
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

.menu-item.muted {
  color: var(--text-muted);
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
  padding: 4px 0 12px;
  min-height: 0;
  flex: 1;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
  padding: 0 12px;
}

.view-tabs {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.view-tab {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
}

.view-tab + .view-tab {
  border-left: 1px solid var(--border);
}

.view-tab.active {
  color: var(--text);
  background: var(--accent-soft);
}

.view-tab:hover:not(.active) {
  background: color-mix(in srgb, var(--accent-soft) 50%, transparent);
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

.file-hint {
  flex: 1;
  font-size: 12px;
  color: var(--text-muted);
}

.hint {
  color: var(--text-muted);
  font-size: 12px;
  padding: 0 12px;
}

.error {
  color: var(--danger);
  font-size: 12px;
  padding: 0 12px;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
  padding: 0 12px;
}

.empty code {
  font-size: 11px;
  color: var(--text);
  opacity: 0.9;
}

.composer {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 12px;
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
