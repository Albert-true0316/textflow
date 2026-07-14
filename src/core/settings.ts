import { getProvider, type ProviderId } from "./ai/providers";

const STORAGE_KEY = "textflow.settings.v1";

export interface AppSettings {
  providerId: ProviderId;
  /** 自定义 / 覆盖 base URL（完整 chat/completions） */
  customBaseUrl: string;
  /** 覆盖模型名；空则用 Provider 默认 */
  model: string;
  /** AI 操作先预览 */
  previewEnabled: boolean;
/** 拆解默认子任务条数（指导.md F006：3–6 条） */
  decomposeCount: number;
}

const DEFAULTS: AppSettings = {
  providerId: "deepseek",
  customBaseUrl: "",
  model: "",
  previewEnabled: true,
  decomposeCount: 4,
};

function clampDecompose(n: number): number {
  if (!Number.isFinite(n)) return 4;
  return Math.min(6, Math.max(3, Math.round(n)));
}

/** 补全 OpenAI 兼容 chat/completions 路径（常见误填只写到 /v1） */
export function normalizeChatCompletionsUrl(url: string): string {
  let trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  if (!/\/chat\/completions$/i.test(trimmed)) {
    trimmed = `${trimmed}/chat/completions`;
  }
  return trimmed;
}

function sanitizeSettings(parsed: Partial<AppSettings>): AppSettings {
  const providerId = parsed.providerId ?? DEFAULTS.providerId;
  const customBaseUrl =
    providerId === "custom" ? (parsed.customBaseUrl ?? "") : "";
  return {
    providerId,
    customBaseUrl,
    model: parsed.model ?? "",
    previewEnabled: parsed.previewEnabled ?? true,
    decomposeCount: clampDecompose(
      parsed.decomposeCount ?? DEFAULTS.decomposeCount,
    ),
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // 兼容旧预览开关
      const oldPreview = localStorage.getItem("textflow.aiPreview");
      return {
        ...DEFAULTS,
        previewEnabled: oldPreview !== "0",
      };
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const next = sanitizeSettings(parsed);
    // 迁移：去掉非自定义 Provider 上残留的 customBaseUrl
    const legacy = parsed as Partial<AppSettings>;
    if (
      legacy.customBaseUrl &&
      (legacy.providerId ?? DEFAULTS.providerId) !== "custom"
    ) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = sanitizeSettings({
    ...loadSettings(),
    ...patch,
  });
  next.decomposeCount = clampDecompose(next.decomposeCount);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  localStorage.setItem("textflow.aiPreview", next.previewEnabled ? "1" : "0");
  return next;
}

/** 解析当前请求用的 URL / 模型 */
export function resolveEndpoint(settings: AppSettings): {
  url: string;
  model: string;
  providerName: string;
} {
  const def = getProvider(settings.providerId);
  const rawUrl =
    settings.providerId === "custom"
      ? settings.customBaseUrl.trim() || def.defaultBaseUrl
      : def.defaultBaseUrl;
  const url = normalizeChatCompletionsUrl(rawUrl);
  const model = settings.model.trim() || def.defaultModel;
  return { url, model, providerName: def.name };
}
