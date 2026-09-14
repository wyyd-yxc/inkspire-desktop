/**
 * api_profiles / settings 域 IPC（设置数据）。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createProfile,
  deleteProfile,
  listProfiles,
  updateProfile
} from '../db/apiProfiles'
import { getSetting, setSetting } from '../db/settings'
import type { CreateApiProfileInput, UpdateApiProfileInput } from '../../shared/ai.types'

/** 设置键写白名单（防止渲染层任意写 settings 表；sync.auto_* 为 M10.5 联动同步设置）。
 *  两个水位键（sync.memory_watermark/sync.wiki_watermark）**不在**写白名单：
 *  它们只经 sync:watermark-merge 专用通道原子合并写入，防止渲染层整键覆盖绕过合并语义（四轮审查 #4） */
const ALLOWED_SETTING_KEYS = new Set([
  'ai.default_profile_id',
  'sync.auto_enabled',
  'sync.auto_interval_min',
  'sync.auto_mode',
  'sync.auto_targets',
  'ui.theme' // M17 外观主题：light | dark | system（渲染层 useTheme 消费）
])

/** 读白名单 = 写白名单 + 水位键（只读开放：UI 需要读水位计算「待提取 N 章」，写仍走专用通道） */
const READABLE_SETTING_KEYS = new Set([
  ...ALLOWED_SETTING_KEYS,
  'sync.memory_watermark',
  'sync.wiki_watermark',
  'sync.plot_watermark'
])

export function registerSettingsIpc(): void {
  ipcMain.handle('api-profiles:list', () => wrap(() => listProfiles()))

  ipcMain.handle('api-profiles:create', (_e, input: CreateApiProfileInput) =>
    wrap(() => createProfile(input))
  )

  ipcMain.handle('api-profiles:update', (_e, id: string, input: UpdateApiProfileInput) =>
    wrap(() => updateProfile(id, input))
  )

  ipcMain.handle('api-profiles:delete', (_e, id: string) =>
    wrap(() => deleteProfile(id))
  )

  ipcMain.handle('settings:get', (_e, key: string, fallback: unknown) =>
    wrap(() => {
      if (!READABLE_SETTING_KEYS.has(key)) throw new Error(`不允许访问的设置键: ${key}`)
      return getSetting(key, fallback)
    })
  )

  ipcMain.handle('settings:set', (_e, key: string, value: unknown) =>
    wrap(() => {
      if (!ALLOWED_SETTING_KEYS.has(key)) throw new Error(`不允许访问的设置键: ${key}`)
      setSetting(key, value)
      return true
    })
  )
}
