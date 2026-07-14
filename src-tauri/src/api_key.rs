/// 清理 API Key：去空白；仅 ASCII 串才剥离 Bearer 前缀（避免 UTF-8 字节切片 panic）
pub fn sanitize_api_key(raw: &str) -> String {
    let mut key = raw.trim().to_string();
    if key.is_ascii() {
        if let Some(rest) = key.strip_prefix("Bearer ") {
            key = rest.trim().to_string();
        } else if let Some(rest) = key.strip_prefix("bearer ") {
            key = rest.trim().to_string();
        } else if let Some(rest) = key.strip_prefix("BEARER ") {
            key = rest.trim().to_string();
        }
    }
    key.retain(|c| !c.is_whitespace());
    key
}

#[cfg(test)]
mod tests {
    use super::sanitize_api_key;

    #[test]
    fn strips_bearer_prefix() {
        assert_eq!(sanitize_api_key("Bearer sk-abc"), "sk-abc");
    }

    #[test]
    fn does_not_panic_on_chinese_input() {
        assert_eq!(sanitize_api_key("请求失败"), "请求失败");
    }
}
