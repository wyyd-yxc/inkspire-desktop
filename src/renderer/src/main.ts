/**
 * 渲染进程入口：挂载 Vue 应用、注册路由与 Pinia。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/theme.css'

createApp(App).use(createPinia()).use(router).mount('#app')

// 启动画面退场（M17）：Vue 挂载完成后淡出移除。
// 注意：不用 requestAnimationFrame（窗口后台时会被冻结，踩坑 #12）——直接 setTimeout 兜底。
const splash = document.getElementById('boot-splash')
if (splash) {
  setTimeout(() => {
    splash.style.transition = 'opacity 200ms ease'
    splash.style.opacity = '0'
    setTimeout(() => splash.remove(), 220)
  }, 60)
}
