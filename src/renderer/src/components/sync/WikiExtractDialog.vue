<script setup lang="ts">
/**
 * 百科「从正文提取」配置弹窗（M10.5）：范围（变更章节/单章）+ 进度显示。
 * 纯配置 UI：抽取编排与候选确认在 useWikiSync / SyncCandidateDialog。
 */
import type { Chapter } from '../../../../shared/chapter.types'

interface Props {
  visible: boolean
  busy: boolean
  progress: string
  unextractedCount: number
  chapters: Chapter[]
}

defineProps<Props>()

const scope = defineModel<'changed' | 'single'>('scope')
const chapterId = defineModel<string>('chapterId')

const emit = defineEmits<{
  start: []
  close: []
}>()
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      @click.self="emit('close')"
    >
      <div class="w-[420px] rounded-2xl bg-surface p-6 shadow-card">
        <h2 class="mb-2 text-lg font-semibold">从正文提取词条</h2>
        <p class="mb-4 text-sm text-ink-text-secondary">
          AI 扫描章节正文，提取人物/地点/物品/势力/技艺/规则等设定元素；已有词条不会重复提取
        </p>
        <div class="mb-3 flex gap-1.5">
          <button
            class="rounded-full border px-3 py-1 text-xs transition-colors"
            :class="scope === 'changed' ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
            @click="scope = 'changed'"
          >待提取章节（{{ unextractedCount }}）</button>
          <button
            class="rounded-full border px-3 py-1 text-xs transition-colors"
            :class="scope === 'single' ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
            @click="scope = 'single'"
          >单章</button>
        </div>
        <label v-if="scope === 'single'" class="flex flex-col gap-1.5">
          <span class="text-sm text-ink-text-secondary">选择章节</span>
          <select
            v-model="chapterId"
            class="rounded-lg border border-ink-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink-primary"
          >
            <option v-for="c in chapters" :key="c.id" :value="c.id">
              第{{ c.sortOrder }}章 {{ c.title }}（{{ c.wordCount }} 字）
            </option>
          </select>
        </label>
        <p v-else class="rounded-lg bg-paper px-3 py-2 text-xs leading-5 text-ink-text-secondary">
          将依次扫描 {{ unextractedCount }} 个未提取（或提取后又有改动）的章节（单轮最多 20 章），完成后统一勾选采纳。
        </p>
        <p v-if="busy && progress" class="mt-3 text-xs text-ink-primary">{{ progress }}</p>
        <div class="mt-5 flex justify-end gap-3">
          <button
            class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary hover:bg-ink-primary-soft"
            @click="emit('close')"
          >{{ busy ? '后台继续' : '取消' }}</button>
          <button
            class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-white hover:bg-ink-primary-hover disabled:opacity-50"
            :disabled="busy || (scope === 'changed' && unextractedCount === 0)"
            @click="emit('start')"
          >{{ busy ? '提取中…' : '开始提取' }}</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
