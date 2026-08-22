/**
 * api_profiles / settings 域 IPC（设置中心数据）。
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

/** 设置键白名单（防止渲染层任意读写 settings 表） */
const ALLOWED_SETTING_KEYS = new Set(['ai.default_profile_id'])

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
      if (!ALLOWED_SETTING_KEYS.has(key)) throw new Error(`不允许访问的设置键: ${key}`)
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
