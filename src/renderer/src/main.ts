/**
 * 渲染进程入口：挂载 Vue 应用、注册路由与 Pinia。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/theme.css'

createApp(App).use(createPinia()).use(router).mount('#app')
