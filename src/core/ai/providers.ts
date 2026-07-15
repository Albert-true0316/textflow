/** OpenAI 兼容 Provider 目录；密钥存本机应用数据目录，此处只存非敏感配置 */

export type ProviderId =
  | "deepseek"
  | "openai"
  | "qwen"
  | "moonshot"
  | "zhipu"
  | "siliconflow"
  | "custom";

export interface ProviderDef {
  id: ProviderId;
  name: string;
  /** chat/completions 完整 URL */
  defaultBaseUrl: string;
  defaultModel: string;
  /** 是否允许用户改 base URL */
  editableUrl?: boolean;
  hint?: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat",
    hint: "国内可用，默认推荐",
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "qwen",
    name: "通义千问",
    defaultBaseUrl:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-plus",
  },
  {
    id: "moonshot",
    name: "Kimi / Moonshot",
    defaultBaseUrl: "https://api.moonshot.cn/v1/chat/completions",
    defaultModel: "moonshot-v1-8k",
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    defaultModel: "glm-4-flash",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    defaultBaseUrl: "https://api.siliconflow.cn/v1/chat/completions",
    defaultModel: "deepseek-ai/DeepSeek-V3",
  },
  {
    id: "custom",
    name: "自定义（OpenAI 兼容）",
    defaultBaseUrl: "https://api.example.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    editableUrl: true,
    hint: "任意 OpenAI 兼容接口；建议填完整 …/chat/completions 地址",
  },
];

export function getProvider(id: ProviderId): ProviderDef {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}
