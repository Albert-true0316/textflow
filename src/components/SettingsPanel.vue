<script setup lang="ts">
import { computed } from "vue";
import type { ProviderId } from "../core/ai/providers";
import type { ProviderDef } from "../core/ai/providers";
import type { ThemeMode } from "../theme/theme";

const props = defineProps<{
  providerId: ProviderId;
  providers: ProviderDef[];
  keyDraft: string;
  hasKey: boolean;
  keySaveHint?: string | null;
  previewEnabled: boolean;
  decomposeCount: number;
  customBaseUrl: string;
  model: string;
  endpointModel: string;
  endpointUrl: string;
  providerEditableUrl: boolean;
  providerHint?: string;
  themeMode: ThemeMode;
}>();

const emit = defineEmits<{
  "update:keyDraft": [string];
  "update:providerId": [ProviderId];
  "update:customBaseUrl": [string];
  "update:model": [string];
  "update:decomposeCount": [number];
  "update:previewEnabled": [boolean];
  "update:themeMode": [ThemeMode];
  saveKey: [];
  clearKey: [];
  close: [];
}>();

const keyModel = computed({
  get: () => props.keyDraft,
  set: (v: string) => emit("update:keyDraft", v),
});
</script>

<template>
  <div class="settings glass-strong">
    <div class="settings-head">
      <p class="settings-title">设置</p>
    </div>

    <section class="block">
      <label class="label">外观</label>
      <select
        class="field"
        :value="themeMode"
        @change="emit('update:themeMode', ($event.target as HTMLSelectElement).value as ThemeMode)"
      >
        <option value="system">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深夜</option>
      </select>
    </section>

    <section class="block">
      <select
        class="field"
        :value="providerId"
        @change="emit('update:providerId', ($event.target as HTMLSelectElement).value as ProviderId)"
      >
        <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <p v-if="providerHint" class="hint">{{ providerHint }}</p>
    </section>

    <section class="block">
      <label class="label">API Key</label>
      <input
        v-model="keyModel"
        class="field"
        type="password"
        :placeholder="hasKey ? '已保存，输入新 Key 可覆盖' : 'sk-...'"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="row">
        <button type="button" class="text-btn" @click="emit('saveKey')">保存 Key</button>
        <button type="button" class="text-btn muted" @click="emit('clearKey')">清除 Key</button>
        <span v-if="keySaveHint" class="ok">{{ keySaveHint }}</span>
        <span v-else-if="hasKey" class="ok">已配置</span>
      </div>
    </section>

    <section class="block">
      <label class="label">模型</label>
      <input
        class="field"
        type="text"
        :value="model"
        :placeholder="endpointModel"
        @change="emit('update:model', ($event.target as HTMLInputElement).value)"
      />
      <p class="hint">留空则用 Provider 默认；中转站须填后台模型列表里的名称。</p>
      <p class="hint endpoint">当前请求模型：{{ endpointModel }}</p>
      <p class="hint endpoint">请求地址：{{ endpointUrl }}</p>
    </section>

    <section v-if="providerEditableUrl" class="block">
      <label class="label">接口地址</label>
      <input
        class="field"
        type="url"
        :value="customBaseUrl"
        placeholder="https://.../v1/chat/completions"
        @change="emit('update:customBaseUrl', ($event.target as HTMLInputElement).value)"
      />
      <p class="hint">请填完整请求地址（不会自动追加路径）。内置 Provider 默认已含 /chat/completions；自定义中转站请按对方文档原样粘贴。</p>
    </section>

    <section class="block">
      <label class="label">拆解默认条数</label>
      <div class="row">
        <input
          class="field count"
          type="number"
          min="3"
          max="6"
          :value="decomposeCount"
          @change="emit('update:decomposeCount', Number(($event.target as HTMLInputElement).value))"
        />
        <span class="hint">默认 4，范围 3–6</span>
      </div>
    </section>

    <section class="block">
      <label class="check-row">
        <input
          type="checkbox"
          :checked="previewEnabled"
          @change="emit('update:previewEnabled', ($event.target as HTMLInputElement).checked)"
        />
        AI 操作先预览再应用
      </label>
    </section>

    <div class="settings-foot">
      <button type="button" class="close-btn" @click="emit('close')">关闭设置</button>
    </div>
  </div>
</template>
<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  max-height: min(72vh, 100%);
  overflow: auto;
  width: 100%;
  box-shadow: var(--glass-shadow);
}

.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-title {
  font-weight: 650;
  font-size: 13px;
}

.settings-foot {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.close-btn {
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.close-btn:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 11px;
  font-weight: 650;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.field {
  width: 100%;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  outline: none;
  color: var(--text);
}

.field.count {
  width: 72px;
}

.hint {
  color: var(--text-muted);
  font-size: 11px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ok {
  font-size: 11px;
  color: var(--accent);
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.text-btn {
  padding: 5px 9px;
  border-radius: 7px;
  background: var(--accent-soft);
  color: var(--text);
  font-size: 12px;
  white-space: nowrap;
  border: 1px solid transparent;
}

.text-btn:hover {
  border-color: var(--border);
}

.text-btn.muted {
  color: var(--text-muted);
  background: transparent;
}
</style>
