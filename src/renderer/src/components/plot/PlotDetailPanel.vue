<script setup lang="ts">
/**
 * 剧情事件详情/新建侧滑面板：标题/描述/标签/挂接词条。
 * 纯表单组件：提交与删除仅 emit，由父视图落库（父层深拷贝去 Proxy 过 IPC，踩坑 #11）。
 */
import { ref, watch } from 'vue'
import type { PlotEvent } from '../../../../shared/plot.types'
import type { WikiEntry } from '../../../../shared/wiki.types'
import { tagColor } from '../../services/plotStyle'

interface Props {
  visible: boolean
  /** null = 新建 */
  event: PlotEvent | null
  wikiEntries: WikiEntry[]
  defaultTitle: string
  /** 来源灵感便签标题（M11 灵感墙回链；null/缺省=无来源） */
  sourceNote?: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  submit: [payload: { title: string; description: string; tags: string[]; wikiRefs: string[] }]
  remove: []
}>()

const form = ref({ title: '', description: '', tagsText: '', wikiRefs: [] as string[] })

// 打开/切换事件时回填表单（form 先于 watch 声明，踩坑 #18：watch immediate 引用的资源必须先声明）
watch(
  () => [props.visible, props.event?.id] as const,
  () => {
    if (!props.visible) return
    form.value = {
      title: props.event?.title ?? props.defaultTitle,
      description: props.event?.description ?? '',
      tagsText: props.event?.tags.join('、') ?? '',
      wikiRefs: [...(props.event?.wikiRefs ?? [])]
    }
  },
  { immediate: true }
)

/** 挂接/取消词条 */
function toggleWiki(id: string): void {
  const i = form.value.wikiRefs.indexOf(id)
  if (i >= 0) form.value.wikiRefs.splice(i, 1)
  else form.value.wikiRefs.push(id)
}

function submit(): void {
  const tags = form.value.tagsText
    .split(/[、,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  emit('submit', {
    title: form.value.title,
    description: form.value.description,
    tags,
    wikiRefs: [...form.value.wikiRefs]
  })
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex justify-end bg-scrim"
      @click.self="emit('close')"
    >
      <div class="flex h-full w-[400px] flex-col bg-surface shadow-2xl">
        <div class="flex items-center justify-between border-b border-ink-border/60 px-5 py-3">
          <h2 class="font-semibold">{{ event ? '编辑剧情事件' : '新建剧情事件' }}</h2>
          <button class="text-ink-text-muted hover:text-ink-text" @click="emit('close')">✕</button>
        </div>
        <p
          v-if="event && sourceNote"
          class="border-b border-ink-border/60 bg-ink-primary-soft/40 px-5 py-1.5 text-xs text-ink-text-secondary"
        >来自灵感墙：「{{ sourceNote }}」</p>
        <div class="flex-1 overflow-y-auto px-5 py-4">
          <div class="flex flex-col gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">标题 *</span>
              <input
                v-model="form.title"
                maxlength="40"
                class="rounded-lg border border-ink-border-strong px-3 py-2 text-sm outline-none focus:border-ink-primary"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">描述（起因/经过/结果要点，AI 参考依据）</span>
              <textarea
                v-model="form.description"
                rows="6"
                class="resize-y rounded-lg border border-ink-border-strong px-3 py-2 text-sm outline-none focus:border-ink-primary"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">标签（顿号分隔，如 高潮、伏笔；首标签决定节点色条）</span>
              <input
                v-model="form.tagsText"
                placeholder="高潮、伏笔、打斗"
                class="rounded-lg border border-ink-border-strong px-3 py-2 text-sm outline-none focus:border-ink-primary"
              />
              <span v-if="form.tagsText.trim()" class="flex flex-wrap gap-1">
                <span
                  v-for="t in form.tagsText.split(/[、,，\s]+/).filter(Boolean)"
                  :key="t"
                  class="rounded-full px-1.5 py-0.5 text-[10px] text-white"
                  :style="{ background: tagColor(t) }"
                >{{ t }}</span>
              </span>
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-sm text-ink-text-secondary">挂接设定集词条（AI 生成时参考设定）</span>
              <p v-if="wikiEntries.length === 0" class="text-xs text-ink-text-muted">
                设定集还没有词条，可先去「设定集」页创建
              </p>
              <div class="flex flex-wrap gap-1.5">
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
            v-if="event"
            class="text-xs text-ink-danger hover:underline"
            @click="emit('remove')"
          >删除事件</button>
          <div class="ml-auto flex gap-2">
            <button
              class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary hover:text-ink-text"
              @click="emit('close')"
            >取消</button>
            <button
              class="rounded-lg bg-ink-primary px-4 py-1.5 text-xs text-on-primary hover:bg-ink-primary-hover"
              @click="submit"
            >{{ event ? '保存' : '创建' }}</button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>
