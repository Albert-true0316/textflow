use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::api_key::sanitize_api_key;

const SERVICE: &str = "app.textflow.widget";
const LEGACY_DEEPSEEK_ACCOUNT: &str = "deepseek_api_key";

#[derive(Default, Serialize, Deserialize)]
struct KeyStore {
    #[serde(flatten)]
    keys: HashMap<String, String>,
}

fn account_for(provider: &str) -> String {
    format!("textflow.{provider}")
}

fn legacy_colon_account(provider: &str) -> String {
    format!("provider:{provider}:api_key")
}

fn secrets_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录：{e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败：{e}"))?;
    Ok(dir.join("api_keys.json"))
}

fn load_store(app: &AppHandle) -> Result<KeyStore, String> {
    let path = secrets_path(app)?;
    if !path.exists() {
        return Ok(KeyStore::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("读取 Key 文件失败：{e}"))?;
    if raw.trim().is_empty() {
        return Ok(KeyStore::default());
    }
    serde_json::from_str(&raw).map_err(|e| format!("解析 Key 文件失败：{e}"))
}

fn save_store(app: &AppHandle, store: &KeyStore) -> Result<(), String> {
    let path = secrets_path(app)?;
    let raw = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("写入 Key 文件失败：{e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn read_keyring_password(service: &str, account: &str) -> Option<String> {
    let entry = keyring::Entry::new(service, account).ok()?;
    match entry.get_password() {
        Ok(v) if !v.is_empty() => Some(v),
        _ => None,
    }
}

fn delete_keyring_quiet(service: &str, account: &str) {
    if let Ok(entry) = keyring::Entry::new(service, account) {
        let _ = entry.delete_credential();
    }
}

/// 旧版钥匙串 Key → 本地文件（只迁移一次，之后不再碰钥匙串，避免反复弹密码）
fn migrate_from_keyring(app: &AppHandle, provider: &str) -> Result<Option<String>, String> {
    let candidates = [
        account_for(provider),
        legacy_colon_account(provider),
        if provider == "deepseek" {
            LEGACY_DEEPSEEK_ACCOUNT.to_string()
        } else {
            String::new()
        },
    ];

    let mut found: Option<String> = None;
    for account in candidates.iter().filter(|a| !a.is_empty()) {
        if let Some(v) = read_keyring_password(SERVICE, account) {
            found = Some(sanitize_api_key(&v));
            break;
        }
    }

    let Some(key) = found.filter(|k| !k.is_empty()) else {
        return Ok(None);
    };

    let mut store = load_store(app)?;
    store.keys.insert(provider.to_string(), key.clone());
    save_store(app, &store)?;

    for account in candidates.iter().filter(|a| !a.is_empty()) {
        delete_keyring_quiet(SERVICE, account);
    }

    Ok(Some(key))
}

#[tauri::command]
pub fn save_api_key(app: AppHandle, provider: String, key: String) -> Result<(), String> {
    let provider = provider.trim().to_string();
    let key = sanitize_api_key(&key);
    if key.is_empty() {
        return Err("API Key 不能为空".into());
    }
    if provider.is_empty() {
        return Err("Provider 不能为空".into());
    }

    let mut store = load_store(&app)?;
    store.keys.insert(provider.clone(), key);
    save_store(&app, &store)?;

    // 清掉旧钥匙串条目，避免以后再访问它弹密码
    delete_keyring_quiet(SERVICE, &account_for(&provider));
    delete_keyring_quiet(SERVICE, &legacy_colon_account(&provider));
    if provider == "deepseek" {
        delete_keyring_quiet(SERVICE, LEGACY_DEEPSEEK_ACCOUNT);
    }

    Ok(())
}

#[tauri::command]
pub fn get_api_key(app: AppHandle, provider: String) -> Result<Option<String>, String> {
    let provider = provider.trim();
    if provider.is_empty() {
        return Err("Provider 不能为空".into());
    }

    let store = load_store(&app)?;
    if let Some(v) = store.keys.get(provider).cloned().filter(|s| !s.is_empty()) {
        return Ok(Some(v));
    }

    migrate_from_keyring(&app, provider)
}

#[tauri::command]
pub fn has_api_key(app: AppHandle, provider: String) -> Result<bool, String> {
    Ok(get_api_key(app, provider)?.is_some())
}

#[tauri::command]
pub fn delete_api_key(app: AppHandle, provider: String) -> Result<(), String> {
    let provider = provider.trim();
    if provider.is_empty() {
        return Err("Provider 不能为空".into());
    }

    let mut store = load_store(&app)?;
    store.keys.remove(provider);
    save_store(&app, &store)?;

    delete_keyring_quiet(SERVICE, &account_for(provider));
    delete_keyring_quiet(SERVICE, &legacy_colon_account(provider));
    if provider == "deepseek" {
        delete_keyring_quiet(SERVICE, LEGACY_DEEPSEEK_ACCOUNT);
    }
    Ok(())
}
