/**
 * Agent 槽位档案解析（M15）：按功能槽位取 API 档案。
 * 解析顺序：槽位绑定档案（agent_bindings 有行且档案存在）→ 默认档案 → 第一个档案 → 报错。
 * 收敛原 aiWriting.resolveProfile 与 AssistantDock 本地副本；连通测试（显式传档案）不经过本模块。
 */
import type { ApiProfile } from '../../../shared/ai.types'
import type { AgentSlot } from '../../../shared/agent.types'
import { isElectron } from './books'

/** 解析槽位应使用的档案：槽位绑定 → 默认档案 → 第一个档案 → 报错 */
export async function resolveProfileForSlot(slot: AgentSlot): Promise<ApiProfile> {
  if (!isElectron) throw new Error('AI 功能仅支持在应用内使用')
  const [listRes, defRes, bindRes] = await Promise.all([
    window.api.apiProfiles.list(),
    window.api.settings.get<string>('ai.default_profile_id', ''),
    window.api.bindings.list()
  ])
  if (!listRes.ok) throw new Error(listRes.error)
  if (!defRes.ok) throw new Error(defRes.error)
  if (!bindRes.ok) throw new Error(bindRes.error)
  const profiles = listRes.data
  if (profiles.length === 0) {
    throw new Error('还没有可用的 AI 档案，请先到「设置」配置 API')
  }
  // 槽位绑定优先；绑定指向的档案已删（理论上 FK 已清行，防御性校验）则继续回落
  const bound = bindRes.data.find((b) => b.slot === slot)
  if (bound) {
    const hit = profiles.find((p) => p.id === bound.profileId)
    if (hit) return hit
  }
  return profiles.find((p) => p.id === defRes.data) ?? profiles[0]
}
