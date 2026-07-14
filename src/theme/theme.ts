/**
 * 主题：浅色 / 深色 / 跟随系统
 */
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "textflow.theme";

export const DARK_MODE_ENABLED = true;

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (!DARK_MODE_ENABLED) return "light";
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

export function applyTheme(mode: ThemeMode = "light") {
  const effective = resolveTheme(mode);
  document.documentElement.dataset.theme = effective;
  document.documentElement.dataset.themeMode = mode;
}

export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function initTheme() {
  applyTheme(getThemeMode());
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  applyTheme(mode);
}
