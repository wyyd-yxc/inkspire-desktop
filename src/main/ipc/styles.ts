/**
 * styles 域 IPC：全局用户风格包（styles:*）CRUD。
 * 预设 5 包不在本域（渲染层 presetStyles.ts 常量直读）；删包的书籍解绑由 FK SET NULL 兜底。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createStyleProfile,
  listStyleProfiles,
  removeStyleProfile,
  updateStyleProfile
} from '../db/styles'
import type {
  CreateStyleProfileInput,
  UpdateStyleProfileInput
} from '../../shared/style.types'

/** 轻量 UUID 校验（照 plot.ts/inspirations.ts 惯例） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function registerStyleIpc(): void {
  ipcMain.handle('styles:list', () => wrap(() => listStyleProfiles()))

  ipcMain.handle('styles:create', (_e, input: CreateStyleProfileInput) =>
    wrap(() => createStyleProfile(input))
  )

  ipcMain.handle('styles:update', (_e, id: string, input: UpdateStyleProfileInput) =>
    wrap(() => {
      if (!UUID_RE.test(id)) throw new Error('参数格式非法')
      return updateStyleProfile(id, input)
    })
  )

  ipcMain.handle('styles:remove', (_e, id: string) =>
    wrap(() => {
      if (!UUID_RE.test(id)) throw new Error('参数格式非法')
      return removeStyleProfile(id)
    })
  )
}
