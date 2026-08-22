<script setup lang="ts">
/**
 * 应用根组件：承载路由出口与全局 Toast 容器。全局皮肤在 styles/theme.css 中定义。
 */
import ToastHost from '@/components/ToastHost.vue'
</script>

<template>
  <router-view />
  <ToastHost />
</template>
