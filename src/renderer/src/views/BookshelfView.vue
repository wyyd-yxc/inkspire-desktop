<script setup lang="ts">
/**
 * 书斋页（占位版，M1 完整实现）。
 * M0 阶段用于验证：窗口渲染、路由、样式令牌、IPC 通路（ping 按钮）。
 */
import { ref } from 'vue'

const pong = ref('')

/** 调用主进程 ping，验证 IPC 通路 */
async function testIpc(): Promise<void> {
  const res = await window.api.ping()
  pong.value = res.ok ? res.data : `IPC 错误：${res.error}`
}
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-8">
    <div class="flex flex-col items-center gap-3">
      <h1 class="text-4xl font-bold tracking-[0.3em] text-ink-primary">墨灵</h1>
      <p class="text-ink-text-secondary">AI 驱动的小说创作工作台 · 桌面版</p>
      <p class="text-xs text-ink-text-muted">书斋（M1 完整实现中）</p>
    </div>
    <button
      class="rounded-full bg-ink-primary px-6 py-2 text-white transition-colors hover:bg-ink-primary-hover"
      @click="testIpc"
    >
      测试 IPC 通路
    </button>
    <p v-if="pong" class="text-sm text-ink-success">主进程响应：{{ pong }} ✓</p>
  </div>
</template>
