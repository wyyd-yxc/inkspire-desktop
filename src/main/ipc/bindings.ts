/**
 * bindings 域 IPC（M15）：功能槽位绑定档案（bindings:list / bindings:set）。
 * slot 为固定枚举（白名单校验），profileId 为 UUID 或空串（空串=解除绑定）。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import { listBindings, setBinding } from '../db/bindings'
import type { AgentSlot } from '../../shared/agent.types'
import { AGENT_SLOTS } from '../../shared/agent.types'

/** 轻量 UUID 校验（照 plot.ts/inspirations.ts 惯例） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function registerBindingsIpc(): void {
  ipcMain.handle('bindings:list', () => wrap(() => listBindings()))

  ipcMain.handle('bindings:set', (_e, slot: AgentSlot, profileId: string) =>
    wrap(() => {
      if (!AGENT_SLOTS.includes(slot)) throw new Error('非法的功能槽位')
      if (profileId !== '' && !UUID_RE.test(profileId)) throw new Error('参数格式非法')
      setBinding(slot, profileId)
      return true
    })
  )
}
