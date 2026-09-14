<script setup lang="ts">
/**
 * 写作台「同步」配置弹窗（M10.5）：勾选同步目标（提取词条/抽取记忆）× 范围（待同步章节/当前章）。
 * 纯配置 UI：执行编排由 WorkspaceView 驱动 useWikiSync/useMemorySync 完成。
 */
import { ref, watch } from 'vue'

interface Props {
  visible: boolean
  busy: boolean
  changedWikiCount: number
  changedMemoryCount: number
  changedPlotCount: number
  /** 当前章有正文才可按「当前章」同步 */
  canSyncCurrent: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  start: [opts: { wiki: boolean; memory: boolean; plot: boolean; scope: 'changed' | 'current' }]
  close: []
}>()

const syncWiki = ref(true)
const syncMemory = ref(true)
const syncPlot = ref(false)
const scope = ref<'changed' | 'current'>('changed')

watch(
  () => props.visible,
  (v) => {
    if (v) {
      if (scope.value === 'current' && !props.canSyncCurrent) scope.value = 'changed'
    }
  }
)

function start(): void {
  emit('start', { wiki: syncWiki.value, memory: syncMemory.value, plot: syncPlot.value, scope: scope.value })
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-scrim"
      @click.self="emit('close')"
    >
      <div class="w-[440px] rounded-[12px] bg-surface p-6 shadow-card">
        <h2 class="mb-1 text-lg font-semibold">同步到其他模块</h2>
        <p class="mb-4 text-xs text-ink-text-muted">
          从正文提取设定与事实，单向推送（只新增、不改写已有内容）；提取结果会先弹窗勾选确认
        </p>
        <div class="flex flex-col gap-2">
          <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-border/60 px-3 py-2 text-sm hover:border-ink-primary/50">
            <input v-model="syncWiki" type="checkbox" />
            <span class="flex-1">提取设定词条 → 设定集</span>
            <span class="text-xs text-ink-text-muted">待提取 {{ changedWikiCount }} 章</span>
          </label>
          <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-border/60 px-3 py-2 text-sm hover:border-ink-primary/50">
            <input v-model="syncMemory" type="checkbox" />
            <span class="flex-1">抽取事实 → 叙事档案</span>
            <span class="text-xs text-ink-text-muted">待抽取 {{ changedMemoryCount }} 章</span>
          </label>
          <label class="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-border/60 px-3 py-2 text-sm hover:border-ink-primary/50">
            <input v-model="syncPlot" type="checkbox" />
            <span class="flex-1">回溯事件 → 情节大纲</span>
            <span class="text-xs text-ink-text-muted">待提取 {{ changedPlotCount }} 章</span>
          </label>
        </div>
        <div class="mt-4 flex gap-1.5">
          <button
            class="rounded-full border px-3 py-1 text-xs transition-colors"
            :class="scope === 'changed' ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
            @click="scope = 'changed'"
          >待同步章节</button>
          <button
            class="rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40"
            :class="scope === 'current' ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
            :disabled="!canSyncCurrent"
            @click="scope = 'current'"
          >仅当前章</button>
        </div>
        <div class="mt-5 flex justify-end gap-3">
          <button
            class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary hover:bg-ink-primary-soft"
            @click="emit('close')"
          >取消</button>
          <button
            class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-on-primary hover:bg-ink-primary-hover disabled:opacity-50"
            :disabled="busy || (!syncWiki && !syncMemory && !syncPlot)"
            @click="start"
          >{{ busy ? '同步中…' : '开始同步' }}</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
