/**
 * api_profiles 表 DAO：AI 接口档案 CRUD。
 * 注意：api_key 仅在本机 SQLite 中存取，任何日志/错误信息不得包含它。
 */
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { getDb } from './database'
import type {
  AiParams,
  ApiProfile,
  CreateApiProfileInput,
  ProviderKind,
  UpdateApiProfileInput
} from '../../shared/ai.types'

interface ProfileRow {
  id: string
  name: string
  provider_kind: string
  base_url: string
  api_key: string
  model: string
  params: string
  created_at: string
  updated_at: string
}

/** 行 → 实体（params JSON 解析容错：坏数据回退空对象） */
function toProfile(r: ProfileRow): ApiProfile {
  let params: AiParams = {}
  try {
    params = JSON.parse(r.params) as AiParams
  } catch {
    // params 字段损坏时静默回退，避免单条脏数据拖垮整个列表
  }
  return {
    id: r.id,
    name: r.name,
    providerKind: r.provider_kind as ProviderKind,
    baseUrl: r.base_url,
    apiKey: r.api_key,
    model: r.model,
    params,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 归一化 baseUrl：去掉末尾斜杠，便于与 /chat/completions 拼接 */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function listProfiles(): ApiProfile[] {
  const d: Database = getDb()
  return (d.prepare('SELECT * FROM api_profiles ORDER BY created_at ASC').all() as ProfileRow[]).map(
    toProfile
  )
}

export function getProfile(id: string): ApiProfile | undefined {
  const d: Database = getDb()
  const row = d.prepare('SELECT * FROM api_profiles WHERE id = ?').get(id) as
    | ProfileRow
    | undefined
  return row ? toProfile(row) : undefined
}

export function createProfile(input: CreateApiProfileInput): ApiProfile {
  const name = input.name.trim()
  if (!name) throw new Error('档案名称不能为空')
  if (!input.baseUrl.trim()) throw new Error('API 地址不能为空')
  if (!input.model.trim()) throw new Error('模型名称不能为空')

  const d: Database = getDb()
  const now = new Date().toISOString()
  const profile: ApiProfile = {
    id: randomUUID(),
    name,
    providerKind: input.providerKind,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    apiKey: input.apiKey.trim(),
    model: input.model.trim(),
    params: input.params ?? {},
    createdAt: now,
    updatedAt: now
  }
  d.prepare(
    `INSERT INTO api_profiles (id, name, provider_kind, base_url, api_key, model, params, created_at, updated_at)
     VALUES (@id, @name, @provider_kind, @base_url, @api_key, @model, @params, @created_at, @updated_at)`
  ).run({
    id: profile.id,
    name: profile.name,
    provider_kind: profile.providerKind,
    base_url: profile.baseUrl,
    api_key: profile.apiKey,
    model: profile.model,
    params: JSON.stringify(profile.params),
    created_at: profile.createdAt,
    updated_at: profile.updatedAt
  })
  return profile
}

export function updateProfile(id: string, input: UpdateApiProfileInput): ApiProfile {
  const existing = getProfile(id)
  if (!existing) throw new Error('档案不存在')

  if (input.name !== undefined && !input.name.trim()) throw new Error('档案名称不能为空')
  if (input.baseUrl !== undefined && !input.baseUrl.trim()) throw new Error('API 地址不能为空')
  if (input.model !== undefined && !input.model.trim()) throw new Error('模型名称不能为空')

  const next: ApiProfile = {
    ...existing,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.providerKind !== undefined ? { providerKind: input.providerKind } : {}),
    ...(input.baseUrl !== undefined ? { baseUrl: normalizeBaseUrl(input.baseUrl) } : {}),
    ...(input.apiKey !== undefined ? { apiKey: input.apiKey.trim() } : {}),
    ...(input.model !== undefined ? { model: input.model.trim() } : {}),
    ...(input.params !== undefined ? { params: input.params } : {}),
    updatedAt: new Date().toISOString()
  }
  const d: Database = getDb()
  d.prepare(
    `UPDATE api_profiles SET name=@name, provider_kind=@provider_kind, base_url=@base_url,
     api_key=@api_key, model=@model, params=@params, updated_at=@updated_at WHERE id=@id`
  ).run({
    id: next.id,
    name: next.name,
    provider_kind: next.providerKind,
    base_url: next.baseUrl,
    api_key: next.apiKey,
    model: next.model,
    params: JSON.stringify(next.params),
    updated_at: next.updatedAt
  })
  return next
}

export function deleteProfile(id: string): boolean {
  const d: Database = getDb()
  const res = d.prepare('DELETE FROM api_profiles WHERE id = ?').run(id)
  return res.changes > 0
}
