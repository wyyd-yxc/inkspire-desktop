/**
 * agent_bindings 表 DAO（M15）：功能槽位绑定 API 档案。
 * slot 主键（一槽位至多一行）；表内无行=「跟随默认」；删档案经 FK ON DELETE CASCADE 自动清行回落。
 */
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import { getProfile } from './apiProfiles'
import type { AgentBinding, AgentSlot } from '../../shared/agent.types'
import { AGENT_SLOTS } from '../../shared/agent.types'

interface AgentBindingRow {
  slot: string
  profile_id: string
}

function toBinding(r: AgentBindingRow): AgentBinding {
  return { slot: r.slot as AgentSlot, profileId: r.profile_id }
}

/** 列出全部槽位绑定（仅含有绑定行的槽位；无行槽位=跟随默认，不在此列） */
export function listBindings(): AgentBinding[] {
  const d: Database = getDb()
  const rows = d.prepare('SELECT slot, profile_id FROM agent_bindings ORDER BY slot').all() as
    AgentBindingRow[]
  return rows.map(toBinding)
}

/**
 * 设置槽位绑定。
 * @param profileId 档案 id（须存在）；空串=解除绑定（删行回落默认）
 */
export function setBinding(slot: AgentSlot, profileId: string): void {
  if (!AGENT_SLOTS.includes(slot)) throw new Error('非法的功能槽位')
  const d: Database = getDb()
  if (profileId === '') {
    d.prepare('DELETE FROM agent_bindings WHERE slot = ?').run(slot)
    return
  }
  if (!getProfile(profileId)) throw new Error('绑定的档案不存在')
  d.prepare(
    'INSERT INTO agent_bindings (slot, profile_id) VALUES (?, ?) ON CONFLICT(slot) DO UPDATE SET profile_id = excluded.profile_id'
  ).run(slot, profileId)
}
