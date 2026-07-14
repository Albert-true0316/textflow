import { invoke } from "@tauri-apps/api/core";
import { onMounted, ref } from "vue";

export type AppPlatform = "windows" | "macos" | "linux" | "unknown";

function detectFromUserAgent(): AppPlatform {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  return "unknown";
}

export function usePlatform() {
  const initial = detectFromUserAgent();
  const platform = ref<AppPlatform>(initial);
  const isWindows = ref(initial === "windows");
  const isMac = ref(initial === "macos");

  onMounted(async () => {
    document.documentElement.dataset.platform = platform.value;
    try {
      const native = (await invoke("app_platform")) as AppPlatform;
      platform.value = native;
      isWindows.value = native === "windows";
      isMac.value = native === "macos";
      document.documentElement.dataset.platform = native;
    } catch {
      /* 浏览器预览：沿用 UA 判断 */
    }
  });

  return { platform, isWindows, isMac };
}
