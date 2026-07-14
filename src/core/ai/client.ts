import { invoke } from "@tauri-apps/api/core";

export interface AiChatResponse {
  status: number;
  body: string;
}

/** 经 Rust 后端发 AI 请求，绕过 WebView HTTP 白名单限制 */
export async function postChatCompletions(options: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
}): Promise<AiChatResponse> {
  return invoke<AiChatResponse>("ai_chat_completions", {
    req: {
      url: options.url,
      apiKey: options.apiKey,
      body: options.body,
    },
  });
}
