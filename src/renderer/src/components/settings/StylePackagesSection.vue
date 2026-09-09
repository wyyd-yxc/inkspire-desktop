<script setup lang="ts">
/**
 * 设置中心「风格包」分区（M12）：全局用户风格包列表 + 新建/编辑/删除。
 * 组件自治（自载列表与书籍绑定计数）；预设 5 包不在此列（构思台基调步展示）。
 */
import { onMounted, ref } from 'vue'
import type { StyleProfile } from '../../../../shared/style.types'
import { isElectron } from '../../services/books'
import { useToast } from '@/composables/useToast'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import StyleProfileDialog from './StyleProfileDialog.vue'

const toast = useToast()
const profiles = ref<StyleProfile[]>([])
const loading = ref(true)

const editorVisible = ref(false)
const editing = ref<StyleProfile | null>(null)
const deleteVisible = ref(false)
const pendingDelete = ref<StyleProfile | null>(null)

const targetText = (p: StyleProfile): string =>
  p.wordTargetMin && p.wordTargetMax
    ? `${p.wordTargetMin}–${p.wordTargetMax} 字/章`
    : p.wordTargetMin
      ? `≥${p.wordTargetMin} 字/章`
      : p.wordTargetMax
        ? `≤${p.wordTargetMax} 字/章`
        : ''

async function load(): Promise<void> {
  if (!isElectron) return
  loading.value = true
  try {
    const stylesRes = await window.api.styles.list()
    if (!stylesRes.ok) throw new Error(stylesRes.error)
    profiles.value = stylesRes.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '风格包加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editing.value = null
  editorVisible.value = true
}
function openEdit(p: StyleProfile): void {
  editing.value = p
  editorVisible.value = true
}

async function doDelete(): Promise<void> {
  const p = pendingDelete.value
  if (!isElectron || !p) return
  const res = await window.api.styles.remove(p.id)
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  toast.success(`风格包「${p.name}」已删除，绑定的书已自动解绑`)
  pendingDelete.value = null
  await load()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="mb-6 rounded-card bg-surface p-5 shadow-card">
    <div class="mb-1 flex items-center justify-between">
      <h2 class="font-semibold">作品风格包</h2>
      <button
        class="rounded-full bg-ink-primary px-4 py-2 text-sm text-white transition-colors hover:bg-ink-primary-hover"
        @click="openCreate"
      >+ 新建风格包</button>
    </div>
    <p class="mb-4 text-sm leading-relaxed text-ink-text-secondary">
      沉淀你自己的文风：文笔调性、叙事规则、单章字数目标。在书房为书籍绑定后，AI 续写/润色与「按场景生成正文」都会遵守；
      不绑定则使用构思台「基调」步选择的预设文风。
    </p>
    <p v-if="loading" class="py-4 text-center text-xs text-ink-text-muted">加载中…</p>
    <p v-else-if="profiles.length === 0" class="rounded-lg bg-paper px-3 py-3 text-xs text-ink-text-muted">
      还没有自建风格包。内置的 5 种预设文风（热血/轻松/悬疑/古风/硬核科幻）始终可在构思台「基调」步使用。
    </p>
    <div v-else class="flex flex-col gap-2.5">
      <article
        v-for="p in profiles"
        :key="p.id"
        class="rounded-lg border border-ink-border px-4 py-3"
      >
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ p.name }}</span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[10px]"
            :class="p.sourceType === 'digest' ? 'bg-ink-warning/10 text-ink-warning' : 'bg-ink-primary-soft text-ink-text-secondary'"
          >{{ p.sourceType === 'digest' ? '拆书' : '自建' }}</span>
          <div class="ml-auto flex gap-3 text-xs">
            <button class="text-ink-text-secondary hover:text-ink-primary" @click="openEdit(p)">编辑</button>
            <button class="text-ink-text-muted hover:text-ink-danger" @click="pendingDelete = p; deleteVisible = true">删除</button>
          </div>
        </div>
        <p v-if="p.tone" class="mt-1 text-xs leading-5 text-ink-text-secondary">{{ p.tone }}</p>
        <ul v-if="p.rules.length" class="mt-1 list-inside list-disc text-xs leading-5 text-ink-text-muted">
          <li v-for="(r, i) in p.rules" :key="i">{{ r }}</li>
        </ul>
        <p class="mt-1 text-xs text-ink-text-muted">
          {{ [targetText(p), p.sample ? `样例：${p.sample.slice(0, 40)}…` : ''].filter(Boolean).join(' · ') }}
        </p>
      </article>
    </div>

    <StyleProfileDialog v-model="editorVisible" :editing="editing" @saved="load" />
    <ConfirmDialog
      v-model="deleteVisible"
      title="删除风格包"
      :description="`「${pendingDelete?.name ?? ''}」删除后，绑定它的书将自动解绑并回落到构思台预设文风。确定删除吗？`"
      confirm-text="删除"
      @confirm="doDelete"
    />
  </section>
</template>
