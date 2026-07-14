import { invoke } from "@tauri-apps/api/core";

export async function saveApiKey(provider: string, key: string) {
  await invoke("save_api_key", { provider, key });
}

export async function getApiKey(provider: string): Promise<string | null> {
  return invoke<string | null>("get_api_key", { provider });
}

export async function hasApiKey(provider: string): Promise<boolean> {
  return invoke<boolean>("has_api_key", { provider });
}

export async function deleteApiKey(provider: string) {
  await invoke("delete_api_key", { provider });
}
