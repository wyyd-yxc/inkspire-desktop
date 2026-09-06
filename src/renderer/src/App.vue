<script setup lang="ts">
/**
 * 应用根组件：承载路由出口、全局 Toast 容器与自动同步调度（M10.5）。
 * 全局皮肤在 styles/theme.css 中定义。
 */
import { onMounted } from 'vue'
import ToastHost from '@/components/ToastHost.vue'
import { startAutoSync } from '@/composables/useAutoSync'

onMounted(() => startAutoSync())
</script>

<template>
  <router-view />
  <ToastHost />
</template>
