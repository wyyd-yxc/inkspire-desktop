<script setup lang="ts">
/**
 * AI 写作面板：编辑器底部的流式预览区，续写/划词/整章润色共用。
 * 状态机：generating（流式中）→ ready（等用户采纳）；停止/放弃随时可用。
 */
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  /** 任务类型（展示标题用） */
  kind: 'continue' | 'polish' | 'expand' | 'rewrite' | 'chapter-polish'
  /** 面板可见性由父级 v-if 控制，本组件只管内容态 */
  visible: boolean
}>()

const emit = defineEmits<{
  accept: [text: string]
  retry: []
  stop: []
  close: []
}>()

const text = ref('')
const phase = ref<'generating' | 'ready'>('generating')

watch(
  () => props.visible,
  (v) => {
    if (v) {
      text.value = ''
      phase.value = 'generating'
    }
  }
)

/** 供父组件推入流式增量 */
function append(chunk: string): void {
  text.value += chunk
}

/** 流结束（父组件在 onDone 里调用） */
function finish(): void {
  if (text.value.trim()) phase.value = 'ready'
}

/** 流失败：保留已到内容供参考，标记结束态 */
function fail(): void {
  phase.value = 'ready'
}

function accept(): void {
  emit('accept', text.value.trim())
}

const kindLabel = computed(
  () =>
    ({
      continue: 'AI 续写',
      polish: '润色结果',
      expand: '扩写结果',
      rewrite: '改写结果',
      'chapter-polish': '整章润色'
    })[props.kind]
)

defineExpose({ append, finish, fail })

const scrollBody = ref<HTMLElement | null>(null)

/** 流式时自动滚到底 */
function autoScroll(): void {
  const el = scrollBody.value
  if (el) el.scrollTop = el.scrollHeight
}
watch(text, () => autoScroll())
</script>

<template>
  <div
    v-if="visible"
    class="flex max-h-[45%] w-full flex-col border-t-2 border-ink-primary/30 bg-ink-primary-soft/40"
  >
    <!-- 标题条 -->
    <div class="flex items-center justify-between px-5 py-2">
      <div class="flex items-center gap-2 text-sm">
        <span class="inline-block h-2 w-2 rounded-full"
          :class="phase === 'generating' ? 'animate-pulse bg-ink-primary' : 'bg-ink-success'" />
        <span class="font-medium text-ink-primary">{{ kindLabel }}</span>
        <span v-if="phase === 'generating'" class="text-ink-text-muted">生成中…</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="phase === 'generating'"
          class="rounded-md px-2 py-1 text-xs text-ink-danger transition-colors hover:bg-ink-danger/10"
          @click="emit('stop')"
        >■ 停止</button>
        <template v-else>
          <button
            class="rounded-md px-2 py-1 text-xs text-ink-text-secondary transition-colors hover:bg-surface hover:text-ink-primary"
            @click="emit('retry')"
          >↻ 重写</button>
          <button
            class="rounded-md px-2 py-1 text-xs text-ink-text-secondary transition-colors hover:bg-surface"
            @click="emit('close')"
          >✕ 关闭</button>
        </template>
      </div>
    </div>

    <!-- 内容区 -->
    <div ref="scrollBody" class="min-h-[80px] flex-1 overflow-y-auto px-5 pb-2">
      <p class="whitespace-pre-wrap text-[14px] leading-7 text-ink-text">{{ text || '等待模型输出…' }}</p>
    </div>

    <!-- 采纳条 -->
    <div v-if="phase === 'ready' && text.trim()" class="flex items-center justify-end gap-2 border-t border-ink-border/50 px-5 py-2">
      <button
        class="rounded-full bg-ink-primary px-4 py-1.5 text-xs text-white transition-colors hover:bg-ink-primary-hover"
        @click="accept"
      >✓ 采纳插入</button>
    </div>
  </div>
</template>
