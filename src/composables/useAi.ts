import { computed, ref } from "vue";
import { sanitizeApiKey } from "../core/ai/apiKey";
import {
  ApiKeyMissingError,
  buildDecomposeUtterance,
  mapNaturalLanguage,
  OfflineError,
} from "../core/ai/mapper";
import {
  deleteApiKey,
  getApiKey,
  saveApiKey,
} from "../core/ai/keychain";
import { getProvider, type ProviderId, PROVIDERS } from "../core/ai/providers";
import { describeOp } from "../core/ai/tools";
import type { Op } from "../core/ops";
import {
  loadSettings,
  normalizeChatCompletionsUrl,
  resolveEndpoint,
  saveSettings,
  type AppSettings,
} from "../core/settings";
import type { Task } from "../core/types";

export function useAi() {
  const settings = ref<AppSettings>(loadSettings());
  const hasKey = ref(false);
  const settingsOpen = ref(false);
  const keyDraft = ref("");
  const keySaveHint = ref<string | null>(null);
  const aiBusy = ref(false);
  const aiError = ref<string | null>(null);
  const pendingOps = ref<Op[]>([]);
  const pendingRejected = ref<string[]>([]);

  const previewEnabled = computed({
    get: () => settings.value.previewEnabled,
    set: (on: boolean) => {
      settings.value = saveSettings({ previewEnabled: on });
    },
  });

  const decomposeCount = computed({
    get: () => settings.value.decomposeCount,
    set: (n: number) => {
      settings.value = saveSettings({ decomposeCount: n });
    },
  });

  const providerId = computed({
    get: () => settings.value.providerId,
    set: (id: ProviderId) => {
      settings.value = saveSettings({ providerId: id });
      void refreshKeyStatus();
    },
  });

  const hasPending = computed(() => pendingOps.value.length > 0);
  const activeProvider = computed(() => getProvider(settings.value.providerId));
  const endpointHint = computed(() => resolveEndpoint(settings.value));

  async function refreshKeyStatus(): Promise<boolean> {
    try {
      const key = await getApiKey(settings.value.providerId);
      hasKey.value = !!key;
      return hasKey.value;
    } catch (e) {
      hasKey.value = false;
      aiError.value =
        e instanceof Error ? e.message : "无法读取 API Key";
      return false;
    }
  }

  /** 执行 AI 操作前实时校验 Key（避免 hasKey 缓存过期） */
  async function ensureApiKeyReady(): Promise<boolean> {
    const ok = await refreshKeyStatus();
    if (!ok) {
      aiError.value = "请先在设置里填入并保存 API Key";
    }
    return ok;
  }

  async function openSettings() {
    settingsOpen.value = true;
    aiError.value = null;
    keySaveHint.value = null;
    settings.value = loadSettings();
    keyDraft.value = "";
    await refreshKeyStatus();
  }

  function closeSettings() {
    settingsOpen.value = false;
  }

  async function onProviderChange(id: ProviderId) {
    settings.value = saveSettings({ providerId: id });
    const def = getProvider(id);
    if (!def.editableUrl) {
      // 切到非自定义时清空覆盖 URL，避免误用
      settings.value = saveSettings({ customBaseUrl: "" });
    } else if (!settings.value.customBaseUrl) {
      settings.value = saveSettings({ customBaseUrl: def.defaultBaseUrl });
    }
    keyDraft.value = "";
    keySaveHint.value = null;
    await refreshKeyStatus();
  }

  function updateCustomBaseUrl(url: string) {
    settings.value = saveSettings({
      customBaseUrl: normalizeChatCompletionsUrl(url),
    });
  }

  function updateModel(model: string) {
    settings.value = saveSettings({ model });
  }

  function updateDecomposeCount(n: number) {
    settings.value = saveSettings({ decomposeCount: n });
  }

  function setPreviewEnabled(on: boolean) {
    settings.value = saveSettings({ previewEnabled: on });
  }

  async function saveKey() {
    const value = sanitizeApiKey(keyDraft.value);
    if (!value) {
      aiError.value = "请输入 API Key";
      return;
    }
    try {
      await saveApiKey(settings.value.providerId, value);
      keyDraft.value = "";
      keySaveHint.value = "已保存到本机";
      aiError.value = null;
      const ok = await refreshKeyStatus();
      if (!ok) {
        keySaveHint.value = null;
        aiError.value = "Key 已写入但读取失败，请重试保存";
      }
    } catch (e) {
      keySaveHint.value = null;
      aiError.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function clearKey() {
    try {
      await deleteApiKey(settings.value.providerId);
      hasKey.value = false;
      keyDraft.value = "";
      keySaveHint.value = null;
      aiError.value = null;
    } catch (e) {
      aiError.value = e instanceof Error ? e.message : String(e);
    }
  }

  function clearPending() {
    pendingOps.value = [];
    pendingRejected.value = [];
  }

  function summarizePending(tasks: Task[]) {
    return pendingOps.value.map((op) => describeOp(op, tasks));
  }

  async function proposeFromNaturalLanguage(
    utterance: string,
    tasks: Task[],
    opts?: { forceDecomposeId?: string },
  ) {
    const text = utterance.trim();
    if (!text) return null;

    aiBusy.value = true;
    aiError.value = null;
    clearPending();

    try {
      const pid = settings.value.providerId;
      if (!(await ensureApiKeyReady())) {
        throw new ApiKeyMissingError();
      }
      const apiKey = await getApiKey(pid);
      if (!apiKey) throw new ApiKeyMissingError();

      const result = await mapNaturalLanguage({
        utterance: text,
        tasks,
        apiKey,
        settings: settings.value,
        forceDecomposeId: opts?.forceDecomposeId,
      });
      pendingOps.value = result.ops;
      pendingRejected.value = result.rejected;

      if (!result.ops.length) {
        aiError.value =
          result.rejected[0] ?? "没有识别出可执行的操作，请换种说法试试";
        return null;
      }

      if (!settings.value.previewEnabled) {
        const ops = [...pendingOps.value];
        clearPending();
        return ops;
      }

      return "preview" as const;
    } catch (e) {
      if (e instanceof OfflineError || e instanceof ApiKeyMissingError) {
        aiError.value = e.message;
      } else {
        aiError.value = e instanceof Error ? e.message : String(e);
      }
      return null;
    } finally {
      aiBusy.value = false;
    }
  }

  function decomposePrompt(id: string, text: string, due?: string) {
    return buildDecomposeUtterance(id, text, settings.value.decomposeCount, due);
  }

  void refreshKeyStatus();

  return {
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
    refreshKeyStatus,
    ensureApiKeyReady,
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
  };
}
