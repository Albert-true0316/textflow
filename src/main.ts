import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";
import { initTheme, setThemeMode } from "./theme/theme";

/** 尽早打上平台标记，避免 Windows 首帧透明/白底闪一下 */
(() => {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) document.documentElement.dataset.platform = "windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) document.documentElement.dataset.platform = "macos";
  else if (/Linux/i.test(ua)) document.documentElement.dataset.platform = "linux";
})();

/** 撤销旧版「首次启动强制深夜」；之后以用户设置为准 */
const NIGHT_FLAG = "textflow.theme.night-on-v1";
if (localStorage.getItem(NIGHT_FLAG)) {
  localStorage.removeItem(NIGHT_FLAG);
  if (localStorage.getItem("textflow.theme") === "dark") {
    setThemeMode("system");
  }
}

initTheme();

createApp(App).mount("#app");
