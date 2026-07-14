/** 清理粘贴 Key 时常见的多余字符 */
export function sanitizeApiKey(raw: string): string {
  let key = raw.trim();
  key = key.replace(/^Bearer\s+/i, "");
  key = key.replace(/^['"`]+|['"`]+$/g, "");
  key = key.replace(/[\u200B-\u200D\uFEFF]/g, "");
  key = key.replace(/\s/g, "");
  return key;
}

function tryParseErrorBody(body: string): {
  code?: string;
  message?: string;
} | null {
  try {
    const data = JSON.parse(body) as {
      error?: { code?: string; message?: string };
      message?: string;
    };
    return {
      code: data.error?.code,
      message: data.error?.message ?? data.message,
    };
  } catch {
    return null;
  }
}

export function formatAiHttpError(
  status: number,
  body: string,
  providerName: string,
  url: string,
  model?: string,
): string {
  const err = tryParseErrorBody(body);
  const modelLabel = model ? `（当前模型：${model}）` : "";

  if (status === 401) {
    return (
      `API Key 无效或未授权（${providerName}）。` +
      `请确认 Provider 与 Key 来源一致，并检查请求地址是否正确。` +
      `建议：设置里点「清除 Key」→ 从官网重新复制 Key → 再保存。` +
      ` 地址：${url}`
    );
  }

  if (
    status === 503 ||
    err?.code === "model_not_found" ||
    /no available channel for model/i.test(err?.message ?? body)
  ) {
    return (
      `模型不可用${modelLabel}。` +
      `你使用的像是 API 中转站：请在设置 → 模型 里填入中转站后台支持的模型名` +
      `（须与后台「模型列表」完全一致，例如 deepseek-chat、gpt-4o-mini）。` +
      (err?.message ? ` 服务端：${err.message.slice(0, 140)}` : "")
    );
  }

  if (status === 400 && /temperature.*deprecated/i.test(err?.message ?? body)) {
    return (
      `当前模型不支持 temperature 参数${modelLabel}。` +
      `请重启 TextFlow 后重试（新版本已不再发送该字段）。`
    );
  }

  const snippet = body.trim().slice(0, 180);
  return `AI 请求失败（${status}）${snippet ? `: ${snippet}` : ""}`;
}
