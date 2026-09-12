<script setup lang="ts">
/**
 * 设置中心「功能槽位」分区（M15）：8 个功能槽位各自绑定 AI 档案，即改即存。
 * 未绑定（跟随默认）时回落默认档案；删除档案经 FK CASCADE 自动清绑定回落。
 */
import { onMounted, ref } from 'vue'
import type { AgentBinding, AgentSlot } from '../../../../shared/agent.types'
import { AGENT_SLOTS, AGENT_SLOT_LABELS, AGENT_SLOT_HINTS } from '../../../../shared/agent.types'
import type { ApiProfile } from '../../../../shared/ai.types'
import { isElectron } from '../../services/books'
import { useToast } from '@/composables/useToast'

const toast = useToast()
const bindings = ref<AgentBinding[]>([])
const profiles = ref<ApiProfile[]>([])
const defaultName = ref('')
const loading = ref(true)
/** 正在保存的槽位（防重复提交，行内下拉禁用） */
const saving = ref<AgentSlot | ''>('')

const boundId = (slot: AgentSlot): string =>
  bindings.value.find((b) => b.slot === slot)?.profileId ?? ''

async function load(): Promise<void> {
  if (!isElectron) return
  loading.value = true
  try {
    const [bRes, pRes, dRes] = await Promise.all([
      window.api.bindings.list(),
      window.api.apiProfiles.list(),
      window.api.settings.get<string>('ai.default_profile_id', '')
    ])
    if (!bRes.ok) throw new Error(bRes.error)
    if (!pRes.ok) throw new Error(pRes.error)
    if (!dRes.ok) throw new Error(dRes.error)
    bindings.value = bRes.data
    profiles.value = pRes.data
    defaultName.value = pRes.data.find((p) => p.id === dRes.data)?.name ?? pRes.data[0]?.name ?? ''
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '槽位绑定加载失败')
  } finally {
    loading.value = false
  }
}

async function onPick(slot: AgentSlot, e: Event): Promise<void> {
  if (!isElectron || saving.value !== '') return
  const profileId = (e.target as HTMLSelectElement).value
  saving.value = slot
  try {
    const res = await window.api.bindings.set(slot, profileId)
    if (!res.ok) throw new Error(res.error)
    const label = AGENT_SLOT_LABELS[slot]
    toast.success(profileId === '' ? `「${label}」已改为跟随默认档案` : `「${label}」已绑定该档案`)
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = ''
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="mb-6 rounded-card bg-surface p-5 shadow-card">
    <h2 class="mb-1 font-semibold">功能槽位</h2>
    <p class="mb-4 text-sm leading-relaxed text-ink-text-secondary">
      为不同功能指定不同的 AI 档案（不同模型各有所长）；「跟随默认」时使用上方 AI 接口档案中的默认档案{{
        defaultName ? `（当前：${defaultName}）` : ''
      }}。
    </p>
    <p v-if="loading" class="py-4 text-center text-xs text-ink-text-muted">加载中…</p>
    <template v-else>
      <div class="flex flex-col gap-1.5">
        <label
          v-for="slot in AGENT_SLOTS"
          :key="slot"
          class="flex items-center gap-3 rounded-lg border border-ink-border/60 px-4 py-2.5"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">{{ AGENT_SLOT_LABELS[slot] }}</span>
            <span class="mt-0.5 block text-xs leading-4 text-ink-text-muted">{{ AGENT_SLOT_HINTS[slot] }}</span>
          </span>
          <select
            class="shrink-0 rounded-lg border border-ink-border bg-paper px-2.5 py-1.5 text-xs text-ink-text disabled:opacity-50"
            :value="boundId(slot)"
            :disabled="saving !== ''"
            @change="onPick(slot, $event)"
          >
            <option value="">跟随默认</option>
            <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}（{{ p.model }}）</option>
          </select>
        </label>
      </div>
      <p v-if="profiles.length === 0" class="mt-3 rounded-lg bg-paper px-3 py-2 text-xs text-ink-text-muted">
        还没有 AI 档案。先在上方「AI 接口档案」新建档案，再回来为槽位指定模型。
      </p>
    </template>
  </section>
</template>
