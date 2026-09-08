<script setup lang="ts">
/**
 * 灵感便签新建/编辑弹窗：类别/标题/内容/关联设定集词条。
 * 纯表单组件：提交与删除仅 emit，由父视图落库（父层构造纯对象过 IPC，踩坑 #11）。
 */
import { ref, watch } from 'vue'
import type { Inspiration, InspirationKind } from '../../../../shared/inspiration.types'
import { INSPIRATION_KIND_LABELS } from '../../../../shared/inspiration.types'
import type { WikiEntry } from '../../../../shared/wiki.types'
import { INSPIRATION_KIND_COLORS } from '../../services/inspirationStyle'

interface Props {
  visible: boolean
  /** null = 新建 */
  inspiration: Inspiration | null
  wikiEntries: WikiEntry[]
  /** 新建时的默认类别（从类别筛选进入时带当前筛选） */
  defaultKind?: InspirationKind
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  submit: [payload: { kind: InspirationKind; title: string; content: string; wikiRefs: string[] }]
  /** 仅编辑态出现：软删入回收站 */
  remove: []
}>()

const KINDS = Object.keys(INSPIRATION_KIND_LABELS) as InspirationKind[]
const form = ref({
  kind: 'idea' as InspirationKind,
  title: '',
  content: '',
  wikiRefs: [] as string[]
})

// 打开时回填表单（form 先于 watch 声明，踩坑 #18）
watch(
  () => props.visible,
  () => {
    if (!props.visible) return
    form.value = props.inspiration
      ? {
          kind: props.inspiration.kind,
          title: props.inspiration.title,
          content: props.inspiration.content,
          wikiRefs: [...props.inspiration.wikiRefs]
        }
      : { kind: props.defaultKind ?? 'idea', title: '', content: '', wikiRefs: [] }
  },
  { immediate: true }
)

/** 关联/取消词条 */
function toggleWiki(id: string): void {
  const i = form.value.wikiRefs.indexOf(id)
  if (i >= 0) form.value.wikiRefs.splice(i, 1)
  else form.value.wikiRefs.push(id)
}

function submit(): void {
  emit('submit', {
    kind: form.value.kind,
    title: form.value.title,
    content: form.value.content,
    wikiRefs: [...form.value.wikiRefs]
  })
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 px-4"
      @click.self="emit('close')"
    >
      <div class="flex max-h-[85vh] w-[520px] flex-col rounded-lg border border-ink-border bg-surface shadow-2xl">
        <div class="flex items-center justify-between border-b border-ink-border/60 px-5 py-3">
          <h2 class="font-semibold">{{ inspiration ? '编辑便签' : '新便签' }}</h2>
          <button class="text-ink-text-muted hover:text-ink-text" @click="emit('close')">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">类别</span>
              <div class="flex gap-1.5">
                <button
                  v-for="k in KINDS"
                  :key="k"
                  class="rounded-full border px-3 py-1 text-xs transition-colors"
                  :class="
                    form.kind === k
                      ? 'border-transparent text-white'
                      : 'border-ink-border text-ink-text-secondary hover:border-ink-primary'
                  "
                  :style="form.kind === k ? { background: INSPIRATION_KIND_COLORS[k] } : {}"
                  @click="form.kind = k"
                >{{ INSPIRATION_KIND_LABELS[k] }}</button>
              </div>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">标题 *</span>
              <input
                v-model="form.title"
                maxlength="40"
                placeholder="一句话概括这条灵感"
                class="rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">内容</span>
              <textarea
                v-model="form.content"
                rows="6"
                placeholder="展开记录：画面、对白、念头、待办细节……"
                class="resize-y rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary"
              />
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">关联设定集词条（可选）</span>
              <p v-if="wikiEntries.length === 0" class="text-xs text-ink-text-muted">
                设定集还没有词条，可先去「设定集」页创建
              </p>
              <div v-else class="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                <button
                  v-for="w in wikiEntries"
                  :key="w.id"
                  class="rounded-full border px-2.5 py-1 text-xs transition-colors"
                  :class="
                    form.wikiRefs.includes(w.id)
                      ? 'border-ink-primary bg-ink-primary-soft text-ink-primary'
                      : 'border-ink-border text-ink-text-secondary hover:border-ink-primary'
                  "
                  @click="toggleWiki(w.id)"
                >{{ w.name }}</button>
              </div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 border-t border-ink-border/60 px-5 py-3">
          <button
            v-if="inspiration"
            class="text-xs text-ink-danger hover:underline"
            @click="emit('remove')"
          >移入回收站</button>
          <div class="ml-auto flex gap-2">
            <button
              class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary hover:text-ink-text"
              @click="emit('close')"
            >取消</button>
            <button
              class="rounded-lg bg-ink-primary px-4 py-1.5 text-xs text-white hover:bg-ink-primary-hover"
              @click="submit"
            >{{ inspiration ? '保存' : '创建' }}</button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>
