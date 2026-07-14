use serde::{Deserialize, Serialize};

use crate::api_key::sanitize_api_key;

#[derive(Serialize)]
pub struct AiChatResponse {
    pub status: u16,
    pub body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub url: String,
    pub api_key: String,
    pub body: serde_json::Value,
}

#[tauri::command]
pub async fn ai_chat_completions(req: AiChatRequest) -> Result<AiChatResponse, String> {
    let url = req.url.trim();
    if url.is_empty() {
        return Err("接口地址不能为空".into());
    }
    let api_key = sanitize_api_key(&req.api_key);
    if api_key.is_empty() {
        return Err("API Key 不能为空".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败：{e}"))?;

    let resp = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&req.body)
        .send()
        .await
        .map_err(|e| format!("无法连接 AI 接口（{url}）：{e}"))?;

    let status = resp.status().as_u16();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取 AI 响应失败：{e}"))?;

    Ok(AiChatResponse { status, body })
}
