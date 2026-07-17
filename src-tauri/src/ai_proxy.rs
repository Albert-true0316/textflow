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

fn format_connect_error(url: &str, err: reqwest::Error) -> String {
    let detail = err.to_string();
    let lower = detail.to_lowercase();
    let hint = if lower.contains("certificate")
        || lower.contains("unknownissuer")
        || lower.contains("invalidcertificate")
        || lower.contains("tls")
        || lower.contains("ssl")
    {
        "常见原因：系统代理/杀软 HTTPS 扫描、企业根证书未信任。请检查代理软件，或暂时关闭 HTTPS 解密后重试。"
    } else if lower.contains("proxy") || lower.contains("tunnel") {
        "常见原因：系统代理不可用。请检查 Clash/系统代理是否正常，或关闭系统代理后重试。"
    } else if lower.contains("timed out") || lower.contains("timeout") {
        "请求超时。请检查网络，或确认能否在浏览器打开该 API 地址。"
    } else if lower.contains("dns")
        || lower.contains("resolve")
        || lower.contains("name or service not known")
        || lower.contains("nodename nor servname")
    {
        "无法解析域名。请检查网络/DNS，或确认接口地址填写正确。"
    } else if lower.contains("connection refused") || lower.contains("connect") {
        "连接被拒绝。请检查网络、防火墙或代理是否拦截了本应用出站请求。"
    } else {
        "请检查网络、系统代理与防火墙是否拦截了 TextFlow 的出站 HTTPS。"
    };
    format!("无法连接 AI 接口（{url}）：{detail}。{hint}")
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
        .map_err(|e| format_connect_error(url, e))?;

    let status = resp.status().as_u16();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取 AI 响应失败：{e}"))?;

    Ok(AiChatResponse { status, body })
}
