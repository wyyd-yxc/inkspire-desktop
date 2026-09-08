<script setup lang="ts">
/**
 * 「入画布」目标选择弹窗：把便签送为情节大纲事件或某章场景规划场景。
 * 纯表单组件：确认仅 emit 目标，由父视图创建节点并写回链（踩坑 #11：纯对象过 IPC）。
 */
import { ref, watch } from 'vue'
import type { Inspiration } from '../../../../shared/inspiration.types'
import type { ChapterMeta } from '../../../../shared/chapter.types'

interface Props {
  visible: boolean
  inspiration: Inspiration | null
  chapters: ChapterMeta[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  confirm: [target: { kind: 'plot' | 'scene'; chapterId: string }]
}>()

const targetType = ref<'plot' | 'scene'>('plot')
const chapterId = ref('')

// 打开时重置：默认情节大纲；章节默认第一章（表单先于 watch 声明，踩坑 #18）
watch(
  () => props.visible,
  () => {
    if (!props.visible) return
    targetType.value = 'plot'
    chapterId.value = props.chapters[0]?.id ?? ''
  },
  { immediate: true }
)

function confirm(): void {
  if (targetType.value === 'scene' && !chapterId.value) return
  emit('confirm', { kind: targetType.value, chapterId: chapterId.value })
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 px-4"
      @click.self="emit('close')"
    >
      <div class="w-[440px] rounded-lg border border-ink-border bg-surface shadow-2xl">
        <div class="flex items-center justify-between border-b border-ink-border/60 px-5 py-3">
          <h2 class="font-semibold">送入画布</h2>
          <button class="text-ink-text-muted hover:text-ink-text" @click="emit('close')">✕</button>
        </div>
        <div class="flex flex-col gap-4 px-5 py-4">
          <p class="rounded-lg bg-paper px-3 py-2 text-xs leading-5 text-ink-text-secondary">
            <span class="font-semibold">「{{ inspiration?.title ?? '' }}」</span>
            {{ (inspiration?.content ?? '').slice(0, 60) }}{{ (inspiration?.content ?? '').length > 60 ? '…' : '' }}
          </p>
          <div class="flex flex-col gap-1">
            <span class="text-sm text-ink-text-secondary">目标</span>
            <div class="flex gap-2">
              <button
                class="flex-1 rounded-lg border px-3 py-2 text-xs transition-colors"
                :class="
                  targetType === 'plot'
                    ? 'border-ink-primary bg-ink-primary-soft text-ink-primary'
                    : 'border-ink-border text-ink-text-secondary hover:border-ink-primary'
                "
                @click="targetType = 'plot'"
              >
                情节大纲事件
                <span class="mt-0.5 block text-[10px] font-normal text-ink-text-muted">跨章节剧情点，全书画布</span>
              </button>
              <button
                class="flex-1 rounded-lg border px-3 py-2 text-xs transition-colors"
                :class="
                  targetType === 'scene'
                    ? 'border-ink-primary bg-ink-primary-soft text-ink-primary'
                    : 'border-ink-border text-ink-text-secondary hover:border-ink-primary'
                "
                @click="targetType = 'scene'"
              >
                场景规划场景
                <span class="mt-0.5 block text-[10px] font-normal text-ink-text-muted">单章内的场景节点</span>
              </button>
            </div>
          </div>
          <label v-if="targetType === 'scene'" class="flex flex-col gap-1">
            <span class="text-sm text-ink-text-secondary">所属章节</span>
            <select
              v-model="chapterId"
              class="rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary"
            >
              <option value="" disabled>选择章节…</option>
              <option v-for="c in chapters" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
            <span v-if="chapters.length === 0" class="text-xs text-ink-warning">本书还没有章节，请先到写作台新建</span>
          </label>
          <p class="text-xs text-ink-text-muted">
            便签标题将成为{{ targetType === 'plot' ? '事件' : '场景' }}标题，内容进入描述；送入后便签标记「已入画布」，可随时解绑重送。
          </p>
        </div>
        <div class="flex justify-end gap-2 border-t border-ink-border/60 px-5 py-3">
          <button
            class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary hover:text-ink-text"
            @click="emit('close')"
          >取消</button>
          <button
            class="rounded-lg bg-ink-primary px-4 py-1.5 text-xs text-white hover:bg-ink-primary-hover disabled:opacity-40"
            :disabled="targetType === 'scene' && (!chapterId || chapters.length === 0)"
            @click="confirm"
          >送入画布</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
