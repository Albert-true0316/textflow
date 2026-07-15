import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";
import { initTheme, setThemeMode } from "./theme/theme";

initTheme();
/** 一次性启用深夜模式；之后可在设置里改，不再强行覆盖 */
const NIGHT_FLAG = "textflow.theme.night-on-v1";
if (!localStorage.getItem(NIGHT_FLAG)) {
  setThemeMode("dark");
  localStorage.setItem(NIGHT_FLAG, "1");
}

createApp(App).mount("#app");
