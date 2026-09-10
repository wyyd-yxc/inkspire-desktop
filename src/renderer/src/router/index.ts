/**
 * 路由表。路径与功能模块的对应关系见 docs/design/architecture.md 第 4 节。
 * M0 仅有书房占位页，后续里程碑逐个补齐。
 */
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  // Electron 加载本地文件，必须用 hash 模式
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'bookshelf',
      component: () => import('@/views/BookshelfView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue')
    },
    {
      path: '/book/:bookId/write',
      name: 'workspace',
      component: () => import('@/views/WorkspaceView.vue')
    },
    {
      path: '/book/:bookId/genesis',
      name: 'genesis',
      component: () => import('@/views/GenesisView.vue')
    },
    {
      path: '/book/:bookId/wiki',
      name: 'wiki',
      component: () => import('@/views/WikiView.vue')
    },
    {
      path: '/book/:bookId/canvas/:chapterId',
      name: 'canvas',
      component: () => import('@/views/CanvasView.vue')
    },
    {
      path: '/book/:bookId/plot',
      name: 'plot',
      component: () => import('@/views/PlotCanvasView.vue')
    },
    {
      path: '/book/:bookId/memory',
      name: 'memory',
      component: () => import('@/views/MemoryView.vue')
    },
    {
      path: '/book/:bookId/inspirations',
      name: 'inspirations',
      component: () => import('@/views/InspirationsWallView.vue')
    },
    {
      path: '/book/:bookId/stats',
      name: 'stats',
      component: () => import('@/views/StatsView.vue')
    }
  ]
})

export default router
