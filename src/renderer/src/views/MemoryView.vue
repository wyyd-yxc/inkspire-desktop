<script setup lang="ts">
/**
 * 作品记忆页：长篇创作的「事实层」（防穿帮）。
 * 五类事实卡片 + 当前剧情视图 + AI 抽取候选确认 + 章节绑定与线索回收。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import type { Chapter } from '../../../shared/chapter.types'
import type {
  Memory,
  MemoryCandidate,
  MemoryKind,
  MemorySource
} from '../../../shared/memory.types'
import {
  MEMORY_KINDS,
  MEMORY_KIND_LABELS
} from '../../../shared/memory.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { buildMemoryExtractMessages, parseMemoryExtract } from '../services/memoryPrompts'
import { generateWriting } from '../services/aiWriting'
import AiWritingPanel from '@/components/AiWritingPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const route = useRoute()
const toast = useToast()
const bookId = route.params.bookId as string

const book = ref<Pick<Book, 'title' | 'genre' | 'description'> | null>(null)
const chapters = ref<Chapter[]>([])
const memories = ref<Memory[]>([])
const loading = ref(true)
const filterKind = ref<MemoryKind | ''>('')

// 编辑弹窗
const panelVisible = ref(false)
const editing = ref<Memory | null>(null)
const form = reactive({ kind: 'plot' as MemoryKind, content: '', chapterNo: 1 })
const saving = ref(false)
const pendingDelete = ref<Memory | null>(null)

// AI 抽取
const extractDialogVisible = ref(false)
const extractChapterId = ref('')
const aiPanel = ref<InstanceType<typeof AiWritingPanel> | null>(null)
const aiPanelVisible = ref(false)
const isBusy = ref(false)
const candidates = ref<Array<MemoryCandidate & { checked: boolean }>>([])

const kindColors: Record<MemoryKind, string> = {
  plot: '#6c5ce7',
  stage: '#2e7d74',
  character: '#b06f2a',
  relationship: '#9d3f63',
  clue: '#3a6fa8'
}

const kindCounts = computed(() => {
  const map = {} as Record<MemoryKind, number>
  for (const k of MEMORY_KINDS) map[k] = memories.value.filter((m) => m.kind === k).length
  return map
})

/** 当前剧情视图：剧情状态 + 舞台时空（按章节序号排序置顶） */
const currentPlotView = computed(() =>
  memories.value
    .filter((m) => m.kind === 'plot' || m.kind === 'stage')
    .sort((a, b) => a.chapterNo - b.chapterNo)
)

const filtered = computed(() => {
  const list = filterKind.value
    ? memories.value.filter((m) => m.kind === filterKind.value)
    : [...memories.value]
  return list.sort((a, b) => b.chapterNo - a.chapterNo || a.createdAt.localeCompare(b.createdAt))
})

function chapterTitleOf(no: number): string {
  const ch = chapters.value.find((c) => c.sortOrder === no)
  return ch ? ch.title : `第 ${no} 章`
}

async function loadAll(): Promise<void> {
  if (!isElectron) {
    loading.value = false
    return
  }
  try {
    const [booksRes, chaptersRes, memRes] = await Promise.all([
      window.api.books.list(),
      window.api.chapters.list(bookId),
      window.api.memories.list(bookId)
    ])
    if (!booksRes.ok) throw new Error(booksRes.error)
    if (!chaptersRes.ok) throw new Error(chaptersRes.error)
    if (!memRes.ok) throw new Error(memRes.error)
    book.value = booksRes.data.find((b) => b.id === bookId) ?? null
    chapters.value = chaptersRes.data
    memories.value = memRes.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editing.value = null
  form.kind = (filterKind.value as MemoryKind) || 'plot'
  form.content = ''
  form.chapterNo = chapters.value.length || 1
  panelVisible.value = true
}

function openEdit(m: Memory): void {
  editing.value = m
  form.kind = m.kind
  form.content = m.content
  form.chapterNo = m.chapterNo
  panelVisible.value = true
}

async function save(): Promise<void> {
  if (!form.content.trim()) {
    toast.error('记忆内容不能为空')
    return
  }
  saving.value = true
  try {
    const plain = JSON.parse(
      JSON.stringify({ kind: form.kind, content: form.content, chapterNo: form.chapterNo })
    )
    const res = editing.value
      ? await window.api.memories.update(editing.value.id, plain)
      : await window.api.memories.create({ bookId, source: 'manual', ...plain })
    if (!res.ok) throw new Error(res.error)
    const i = memories.value.findIndex((m) => m.id === res.data.id)
    if (i >= 0) memories.value[i] = res.data
    else memories.value.push(res.data)
    panelVisible.value = false
    toast.success('记忆已保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function doDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target) return
  const res = await window.api.memories.remove(target.id)
  if (!res.ok) {
    toast.error(res.error)
  } else {
    memories.value = memories.value.filter((m) => m.id !== target.id)
    toast.success('记忆已删除')
  }
  pendingDelete.value = null
}

/** 线索回收/ reopened 开关 */
async function toggleResolved(m: Memory): Promise<void> {
  try {
    const res = await window.api.memories.update(m.id, { isResolved: !m.isResolved })
    if (!res.ok) throw new Error(res.error)
    const i = memories.value.findIndex((x) => x.id === res.data.id)
    if (i >= 0) memories.value[i] = res.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '更新失败')
  }
}

// ---- AI 抽取 ----
function openExtractDialog(): void {
  if (chapters.value.length === 0) {
    toast.error('请先在正文中撰写章节内容')
    return
  }
  extractChapterId.value = chapters.value[chapters.value.length - 1].id
  candidates.value = []
  extractDialogVisible.value = true
}

async function startExtract(): Promise<void> {
  if (isBusy.value || !book.value) return
  const ch = chapters.value.find((c) => c.id === extractChapterId.value)
  if (!ch) return
  const text = ch.content.replace(/<[^>]+>/g, '').trim()
  if (!text) {
    toast.error('该章节还没有正文')
    return
  }
  extractDialogVisible.value = false
  isBusy.value = true
  aiPanelKind.value = 'chapter-polish'
  aiPanelVisible.value = true
  aiPanel.value?.reset()
  try {
    const messages = buildMemoryExtractMessages(book.value, ch.title, ch.sortOrder, text)
    await generateWriting(messages, {
      onChunk: (t) => aiPanel.value?.append(t),
      onDone: () => aiPanel.value?.finish(),
      onError: (m) => {
        aiPanel.value?.fail()
        toast.error(m)
      }
    })
  } catch (err) {
    aiPanel.value?.fail()
    toast.error(err instanceof Error ? err.message : '抽取失败')
  } finally {
    isBusy.value = false
  }
}

/** 采纳抽取结果：逐条确认入库 */
async function acceptExtract(text: string): Promise<void> {
  const parsed = parseMemoryExtract(text)
  if (parsed.length === 0) {
    toast.error('AI 输出格式异常，无法解析。可手动添加')
    return
  }
  const chapterNo = chapters.value.find((c) => c.id === extractChapterId.value)?.sortOrder ?? 1
  candidates.value = parsed.map((c) => ({ ...c, checked: true }))
  aiPanelVisible.value = false
  // 候选确认：简单起见直接批量入库（勾选式确认面板挂后续）
  let created = 0
  try {
    for (const c of candidates.value) {
      const res = await window.api.memories.create({
        bookId,
        kind: c.kind,
        content: c.content,
        chapterNo,
        source: 'ai'
      })
      if (res.ok) {
        memories.value.push(res.data)
        created++
      }
    }
    toast.success(`AI 抽取完成，已入库 ${created} 条记忆`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '入库失败')
  }
}

const aiPanelKind = ref<'chapter-polish'>('chapter-polish')

onMounted(loadAll)
</script>

<template>
  <div class="flex h-full">
    <!-- 左栏：类型筛选 + 概览 + 操作 -->
    <aside class="flex w-52 shrink-0 flex-col border-r border-ink-border/60 bg-surface">
      <div class="border-b border-ink-border/60 px-4 py-3">
        <router-link :to="`/book/${bookId}/write`" class="text-xs text-ink-text-muted hover:text-ink-primary">← 工作台</router-link>
        <p class="mt-2 text-sm font-semibold">作品记忆</p>
        <p class="truncate text-xs text-ink-text-muted" :title="book?.title">{{ book?.title ?? '…' }}</p>
      </div>
      <div class="px-2 py-3">
        <button
          class="mb-2 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors"
          :class="filterKind === '' ? 'bg-ink-primary-soft text-ink-primary font-medium' : 'text-ink-text-secondary hover:bg-paper'"
          @click="filterKind = ''"
        >
          全部 <span class="text-xs text-ink-text-muted">{{ memories.length }}</span>
        </button>
        <button
          v-for="k in MEMORY_KINDS"
          :key="k"
          class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors"
          :class="filterKind === k ? 'bg-ink-primary-soft text-ink-primary font-medium' : 'text-ink-text-secondary hover:bg-paper'"
          @click="filterKind = k"
        >
          <span class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full" :style="{ background: kindColors[k] }" />
            {{ MEMORY_KIND_LABELS[k] }}
          </span>
          <span class="text-xs text-ink-text-muted">{{ kindCounts[k] }}</span>
        </button>
      </div>
      <div class="mt-auto flex flex-col gap-1.5 p-3">
        <button
          class="rounded-lg bg-ink-primary px-3 py-1.5 text-xs text-white transition-colors hover:bg-ink-primary-hover"
          @click="openCreate"
        >+ 手动记一条</button>
        <button
          class="rounded-lg border border-ink-primary px-3 py-1.5 text-xs text-ink-primary transition-colors hover:bg-ink-primary-soft"
          @click="openExtractDialog"
        >✦ AI 从章节抽取</button>
      </div>
    </aside>

    <!-- 中栏 -->
    <main class="min-w-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-3xl px-6 py-5">
        <div v-if="loading" class="py-24 text-center text-ink-text-muted">加载中…</div>

        <template v-else>
          <!-- 当前剧情视图（plot+stage 置顶） -->
          <section v-if="currentPlotView.length" class="mb-6">
            <h2 class="mb-2 text-sm font-semibold text-ink-text-secondary">当前剧情（剧情状态与舞台时空）</h2>
            <div class="flex flex-col gap-2">
              <div
                v-for="m in currentPlotView"
                :key="m.id"
                class="flex items-start gap-2 rounded-lg border-l-4 bg-surface px-3 py-2 shadow-card"
                :style="{ borderColor: kindColors[m.kind] }"
              >
                <span class="shrink-0 rounded bg-paper px-1.5 py-0.5 text-[10px] text-ink-text-muted">第{{ m.chapterNo }}章起</span>
                <p class="min-w-0 flex-1 text-sm">{{ m.content }}</p>
                <div class="flex shrink-0 gap-1">
                  <button class="text-xs text-ink-text-muted hover:text-ink-primary" @click="openEdit(m)">编辑</button>
                  <button class="text-xs text-ink-text-muted hover:text-ink-danger" @click="pendingDelete = m">删除</button>
                </div>
              </div>
            </div>
          </section>

          <!-- 全部记忆列表 -->
          <div v-if="filtered.length === 0" class="flex flex-col items-center gap-3 py-20">
            <p class="text-ink-text-secondary">{{ memories.length ? '该类型暂无记忆' : '还没有记忆' }}</p>
            <p class="text-sm text-ink-text-muted">手动记录，或让 AI 从章节正文抽取</p>
          </div>
          <div v-else class="flex flex-col gap-2">
            <div
              v-for="m in filtered"
              :key="m.id"
              class="group flex items-start gap-2 rounded-lg bg-surface px-3 py-2.5 shadow-card transition-shadow hover:shadow-lg"
            >
              <span
                class="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] text-white"
                :style="{ background: kindColors[m.kind] }"
              >{{ MEMORY_KIND_LABELS[m.kind] }}</span>
              <div class="min-w-0 flex-1">
                <p class="text-sm leading-6">
                  {{ m.content }}
                  <span v-if="m.kind === 'clue'" class="ml-1 rounded px-1 py-0.5 text-[10px]" :class="m.isResolved ? 'bg-ink-success/15 text-ink-success' : 'bg-ink-warning/15 text-ink-warning'">
                    {{ m.isResolved ? '已回收' : '未回收' }}
                  </span>
                </p>
                <p class="mt-0.5 text-xs text-ink-text-muted">
                  第{{ m.chapterNo }}章起 · {{ m.source === 'ai' ? 'AI 抽取' : '手动' }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-0.5">
                <div class="flex gap-1 text-xs opacity-60 transition-opacity group-hover:opacity-100">
                  <button class="text-ink-text-muted hover:text-ink-primary" @click="openEdit(m)">编辑</button>
                  <button class="text-ink-text-muted hover:text-ink-danger" @click="pendingDelete = m">删除</button>
                </div>
                <button
                  v-if="m.kind === 'clue'"
                  class="text-[10px] text-ink-text-muted hover:text-ink-primary"
                  @click="toggleResolved(m)"
                >{{ m.isResolved ? '标记未回收' : '标记已回收' }}</button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>

    <!-- 编辑弹窗 -->
    <teleport to="body">
      <div v-if="panelVisible" class="fixed inset-0 z-40 flex items-center justify-center bg-black/30" @click.self="panelVisible = false">
        <div class="w-[440px] rounded-2xl bg-surface p-6 shadow-card">
          <h2 class="mb-4 text-lg font-semibold">{{ editing ? '编辑记忆' : '手动记一条' }}</h2>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <span class="text-sm text-ink-text-secondary">类型</span>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="k in MEMORY_KINDS"
                  :key="k"
                  class="rounded-full border px-2.5 py-1 text-xs transition-colors"
                  :class="form.kind === k ? 'border-ink-primary bg-ink-primary-soft text-ink-primary' : 'border-ink-border text-ink-text-secondary'"
                  @click="form.kind = k"
                >{{ MEMORY_KIND_LABELS[k] }}</button>
              </div>
            </div>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm text-ink-text-secondary">内容（40 字内，明确主语与变化）</span>
              <textarea v-model="form.content" rows="3" maxlength="120" placeholder="如：主角左臂骨折，未得医治" class="resize-none rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm text-ink-text-secondary">自第几章起成立</span>
              <input v-model.number="form.chapterNo" type="number" min="1" class="w-24 rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary" />
            </label>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary hover:bg-ink-primary-soft" @click="panelVisible = false">取消</button>
            <button class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-white hover:bg-ink-primary-hover disabled:opacity-50" :disabled="saving" @click="save">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- AI 抽取设置弹窗 -->
    <teleport to="body">
      <div v-if="extractDialogVisible" class="fixed inset-0 z-40 flex items-center justify-center bg-black/30" @click.self="extractDialogVisible = false">
        <div class="w-[420px] rounded-2xl bg-surface p-6 shadow-card">
          <h2 class="mb-2 text-lg font-semibold">✦ AI 从章节抽取记忆</h2>
          <p class="mb-4 text-sm text-ink-text-secondary">AI 扫描所选章节正文，提取影响后续剧情的事实变化</p>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm text-ink-text-secondary">选择章节</span>
            <select v-model="extractChapterId" class="rounded-lg border border-ink-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink-primary">
              <option v-for="c in chapters" :key="c.id" :value="c.id">
                第{{ c.sortOrder }}章 {{ c.title }}（{{ c.wordCount }} 字）
              </option>
            </select>
          </label>
          <div class="mt-5 flex justify-end gap-3">
            <button class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary hover:bg-ink-primary-soft" @click="extractDialogVisible = false">取消</button>
            <button class="rounded-lg bg-ink-primary px-5 py-2 text-sm text-white hover:bg-ink-primary-hover" @click="startExtract">开始抽取</button>
          </div>
        </div>
      </div>
    </teleport>

    <AiWritingPanel
      ref="aiPanel"
      :visible="aiPanelVisible"
      :kind="aiPanelKind"
      @accept="acceptExtract"
      @retry="startExtract"
      @stop="aiPanelVisible = false; isBusy = false"
      @close="aiPanelVisible = false; isBusy = false"
    />

    <ConfirmDialog
      :model-value="pendingDelete !== null"
      @update:model-value="pendingDelete = null"
      title="删除这条记忆？"
      description="删除后 AI 写作不再遵守该事实。"
      @confirm="doDelete"
    />
  </div>
</template>
