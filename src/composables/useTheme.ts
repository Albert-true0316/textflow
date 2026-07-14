import { onMounted, onUnmounted, ref } from "vue";
import {
  getThemeMode,
  initTheme,
  setThemeMode,
  type ThemeMode,
} from "../theme/theme";

export function useTheme() {
  const themeMode = ref<ThemeMode>(getThemeMode());

  function updateThemeMode(mode: ThemeMode) {
    themeMode.value = mode;
    setThemeMode(mode);
  }

  let media: MediaQueryList | null = null;
  const onSystemThemeChange = () => {
    if (themeMode.value === "system") setThemeMode("system");
  };

  onMounted(() => {
    initTheme();
    themeMode.value = getThemeMode();
    media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", onSystemThemeChange);
  });

  onUnmounted(() => {
    media?.removeEventListener("change", onSystemThemeChange);
  });

  return { themeMode, updateThemeMode };
}
