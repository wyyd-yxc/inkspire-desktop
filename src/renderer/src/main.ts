/**
 * 渲染进程入口：挂载 Vue 应用、注册路由与 Pinia。
 */
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { applyThemeBeforeMount } from './composables/useTheme'
import './styles/theme.css'

// 挂载前同步应用主题（M17 灭 FOUC）：preload 已注入主进程读库结果
applyThemeBeforeMount()

createApp(App).use(createPinia()).use(router).mount('#app')

// 启动画面退场（M17）：等首帧真正渲染完成再淡出（r4 中危项——固定 60ms 在慢机器上会提前暴露白屏）。
// 双保险：① nextTick（Vue 完成 DOM 更新）② 一次 rAF + setTimeout 兜底（rAF 后台冻结，踩坑 #12）；
// 上限 600ms 防止极端情况下 splash 永久滞留。
const splash = document.getElementById('boot-splash')
if (splash) {
  let removed = false
  const dismiss = (): void => {
    if (removed) return
    removed = true
    splash.style.transition = 'opacity 200ms ease'
    splash.style.opacity = '0'
    setTimeout(() => splash.remove(), 220)
  }
  nextTick(() => {
    // 首帧渲染后（rAF 可能被后台冻结，故仅作优先路径，超时兜底保证必退场）
    requestAnimationFrame(() => setTimeout(dismiss, 0))
    setTimeout(dismiss, 600)
  })
}
