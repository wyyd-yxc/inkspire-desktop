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
      path: '/book/:bookId',
      // M15.5 布局重规划：书内页面共用全局导航壳（左侧常驻导航+章节树+助手浮球）
      component: () => import('@/layouts/BookShellLayout.vue'),
      children: [
        { path: '', redirect: (to) => ({ path: `/book/${String(to.params.bookId)}/write` }) },
        {
          path: 'write',
          name: 'workspace',
          component: () => import('@/views/WorkspaceView.vue')
        },
        {
          path: 'genesis',
          name: 'genesis',
          component: () => import('@/views/GenesisView.vue')
        },
        {
          path: 'wiki',
          name: 'wiki',
          component: () => import('@/views/WikiView.vue')
        },
        {
          path: 'canvas/:chapterId',
          name: 'canvas',
          component: () => import('@/views/CanvasView.vue')
        },
        {
          path: 'plot',
          name: 'plot',
          component: () => import('@/views/PlotCanvasView.vue')
        },
        {
          path: 'memory',
          name: 'memory',
          component: () => import('@/views/MemoryView.vue')
        },
        {
          path: 'inspirations',
          name: 'inspirations',
          component: () => import('@/views/InspirationsWallView.vue')
        },
        {
          path: 'stats',
          name: 'stats',
          component: () => import('@/views/StatsView.vue')
        }
      ]
    }
  ]
})

export default router
