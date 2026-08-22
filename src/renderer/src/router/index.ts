/**
 * 路由表。路径与功能模块的对应关系见 docs/design/architecture.md 第 4 节。
 * M0 仅有书斋占位页，后续里程碑逐个补齐。
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
    }
  ]
})

export default router
