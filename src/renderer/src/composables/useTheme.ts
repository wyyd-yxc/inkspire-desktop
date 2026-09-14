/**
 * 外观主题（M17）：浅色「案头纸墨」/ 深色「深夜书房」/ 跟随系统。
 * 存 settings 键 ui.theme（主进程白名单已登记）；实际主题经 <html data-theme="dark"> 切换，
 * 令牌层（styles/theme.css）负责全部颜色映射，组件零感知。
 */
import { ref } from 'vue'
import { isElectron } from '@/services/books'

export type ThemeMode = 'light' | 'dark' | 'system'

const mode = ref<ThemeMode>('light')
/** 系统当前是否深色（system 模式下生效） */
const systemDark = ref(false)

let media: MediaQueryList | null = null

/** 当前实际渲染的主题（light | dark） */
export function effectiveTheme(): 'light' | 'dark' {
  if (mode.value === 'system') return systemDark.value ? 'dark' : 'light'
  return mode.value
}

function apply(): void {
  const el = document.documentElement
  if (effectiveTheme() === 'dark') el.setAttribute('data-theme', 'dark')
  else el.removeAttribute('data-theme')
}

/** 切换模式（写库 + 立即生效） */
export async function setThemeMode(next: ThemeMode): Promise<void> {
  mode.value = next
  apply()
  if (isElectron) {
    await window.api.settings.set('ui.theme', next)
  }
}

/** 应用启动时初始化（App.vue onMounted 调用一次） */
export async function initTheme(): Promise<void> {
  media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  media.addEventListener('change', (e) => {
    systemDark.value = e.matches
    if (mode.value === 'system') apply()
  })
  if (isElectron) {
    const res = await window.api.settings.get<string>('ui.theme', 'light')
    if (res.ok && (res.data === 'light' || res.data === 'dark' || res.data === 'system')) {
      mode.value = res.data
    }
  }
  apply()
}

/**
 * 首帧前同步应用主题（M17 灭 FOUC）：由 main.ts 在挂载前调用。
 * 依赖 preload 同步注入的 window.__inkspire_theme__（主进程启动时已读库），
 * 无该字段时回退 system 检测——保证「用户设深色但系统浅色」不闪白。
 */
export function applyThemeBeforeMount(): void {
  const injected = (window as unknown as { __inkspire_theme__?: string }).__inkspire_theme__
  if (injected === 'dark' || injected === 'light' || injected === 'system') {
    mode.value = injected as ThemeMode
  }
  systemDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  apply()
}

export function useTheme(): {
  mode: typeof mode
  setMode: typeof setThemeMode
} {
  return { mode, setMode: setThemeMode }
}