import { postChatCompletions } from "./client";
import type { AiChatResponse } from "./client";
import { formatAiHttpError, sanitizeApiKey } from "./apiKey";
import type { Op } from "../ops";
import type { Task } from "../types";
import type { AppSettings } from "../settings";
import { resolveEndpoint } from "../settings";
import type { ProviderId } from "./providers";
import {
  AI_TOOLS,
  buildTaskContext,
  systemPrompt,
  validateOps,
} from "./tools";

export class OfflineError extends Error {
  constructor(message = "需联网才能使用自然语言功能") {
    super(message);
    this.name = "OfflineError";
  }
}

export class ApiKeyMissingError extends Error {
  constructor(message = "请先在设置里填入 API Key") {
    super(message);
    this.name = "ApiKeyMissingError";
  }
}

function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** DeepSeek V4 / reasoner 等 thinking 模型不接受强制指定某个 tool */
function prefersAutoToolChoice(model: string): boolean {
  const m = model.toLowerCase();
  return (
    /v4/.test(m) ||
    m.includes("reasoner") ||
    m.includes("thinking") ||
    /(^|[/_\-])r1($|[/_\-])/.test(m)
  );
}

/**
 * DeepSeek V4 默认开启 Thinking；本应用是单次 tool call，关闭 Thinking 更稳。
 * 仅官方 DeepSeek Provider 传该字段，避免中转站/其它厂商 400。
 */
function shouldDisableThinking(providerId: ProviderId, model: string): boolean {
  if (providerId !== "deepseek") return false;
  const m = model.toLowerCase();
  return /v4/.test(m) || m === "deepseek-chat" || m === "deepseek-reasoner";
}

function assertOnline() {
  // Tauri WebView 里 navigator.onLine 不可靠，真实连通性交给 Rust 请求判断
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface MapResult {
  ops: Op[];
  rejected: string[];
  rawContent?: string;
}

/** 自然语言 → 校验后的操作数组（不写文件） */
export async function mapNaturalLanguage(options: {
  utterance: string;
  tasks: Task[];
  apiKey: string;
  settings: AppSettings;
  /** 点「拆」时传入，纠正模型乱填的 id */
  forceDecomposeId?: string;
}): Promise<MapResult> {
  assertOnline();
  const key = sanitizeApiKey(options.apiKey);
  if (!key) throw new ApiKeyMissingError();

  const { url, model, providerName } = resolveEndpoint(options.settings);
  const count = options.settings.decomposeCount;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt(todayISO(), count),
    },
    {
      role: "user",
      content: `当前任务树：\n${buildTaskContext(options.tasks)}\n\n用户说：${options.utterance.trim()}`,
    },
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    tools: AI_TOOLS,
    // V4 thinking 等只接受 auto/none；其它模型仍强制走 apply_todo_ops
    tool_choice: prefersAutoToolChoice(model)
      ? "auto"
      : {
          type: "function",
          function: { name: "apply_todo_ops" },
        },
    // 不传 temperature：部分 Claude 等模型会因该字段返回 400
  };
  if (shouldDisableThinking(options.settings.providerId, model)) {
    body.thinking = { type: "disabled" };
  }

  let response: AiChatResponse;
  try {
    response = await postChatCompletions({
      url,
      apiKey: key,
      body,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg || "无法连接 AI 接口");
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      formatAiHttpError(
        response.status,
        response.body,
        providerName,
        url,
        model,
      ),
    );
  }

  let data: {
    choices?: Array<{
      message?: ChatMessage;
    }>;
  };
  try {
    data = JSON.parse(response.body) as typeof data;
  } catch {
    throw new Error("AI 返回了非 JSON 响应");
  }

  const message = data.choices?.[0]?.message;
  const toolCall = message?.tool_calls?.find(
    (c) => c.function?.name === "apply_todo_ops",
  );

  if (!toolCall) {
    return {
      ops: [],
      rejected: [
        `模型没有返回工具调用（当前：${model}）。可换 deepseek-v4-flash / deepseek-chat 再试。`,
      ],
      rawContent: message?.content ?? undefined,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    return { ops: [], rejected: ["工具参数不是合法 JSON"] };
  }

  const { ops, rejected } = validateOps(parsed, options.tasks, {
    forceDecomposeId: options.forceDecomposeId,
  });
  return { ops, rejected };
}

/** 生成「拆解」用的生活化指令 */
export function buildDecomposeUtterance(
  id: string,
  text: string,
  count: number,
  due?: string,
): string {
  const dueLine = due
    ? `父任务截止 ${due}：子任务 due 必须 ≤ 该日，尽量从今天起均匀排到截止日前。`
    : "子任务若能确定时间，请填 due（YYYY-MM-DD）。";
  return `帮我把任务 id=${id}（「${text}」）拆成 ${count} 条左右（3–6 条内）马上能动手做的小事。用 decompose，id 必须填 ${id}（不要带 ^）。${dueLine}子任务要带动作（比如「写」「打」「整理」），别写空泛的「准备一下」。`;
}
