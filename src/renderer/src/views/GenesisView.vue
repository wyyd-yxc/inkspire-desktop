<script setup lang="ts">
/**
 * 构思台页：五步向导（基调/内核/世界构建/布局/开笔）。
 * 顶部步骤条可跳转；每步独立保存（UPSERT）；内核支持 AI 辅助，世界构建支持一键起草。
 * 完成第五步（开笔）即 MVP 闭环：跳转写作台，设定已接通 AI 写作。
 */
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import type {
  GenesisStep,
  GenesisStepRecord,
  Step1Style,
  Step2Soul,
  Step3World,
  Step4Layout,
  Step5Write
} from '../../../shared/genesis.types'
import { PRESET_STYLES } from '../../../shared/presetStyles'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import { generateWriting } from '../services/aiWriting'
import { genesisToWorldEntries } from '../services/wikiPrompts'
import {
  buildSoulAssistMessages,
  buildWorldColdStartMessages,
  parseSoulAssist,
  parseWorldColdStart
} from '../services/genesisPrompts'
import { isWikiNameDup } from '../services/syncService'
import AiWritingPanel from '@/components/AiWritingPanel.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
// 响应式 bookId（防同路由跨书导航时组件复用拿旧 id，M6 自测教训）
const bookId = computed(() => route.params.bookId as string)

const book = ref<Pick<Book, 'title' | 'genre' | 'description'> | null>(null)
const steps = ref<Record<number, GenesisStepRecord>>({})
const activeStep = ref<GenesisStep>(1)
const loading = ref(true)

// 各步本地编辑态（与 DB 双向，保存后同步）
const step1 = ref<Step1Style>({ styleId: '', styleName: '' })
const step2 = ref<Step2Soul>(emptySoul())
const step3 = ref<Step3World | null>(null)
const step4 = ref<Step4Layout>(emptyLayout())
const step5 = ref<Step5Write>({ started: false })

// AI 面板（内核辅助/世界构建起草共用）
const aiPanel = ref<InstanceType<typeof AiWritingPanel> | null>(null)
const aiPanelVisible = ref(false)
const aiPanelKind = ref<'soul' | 'world'>('soul')
let isBusy = false

function emptySoul(): Step2Soul {
  return {
    logline: '',
    genre: { mainType: '', subType: '', targetReader: '', mood: '' },
    cheat: { coreAbility: '', powerSystem: '', limitation: '' },
    conflict: { opening: '', mainline: '', ultimate: '', villain: '' }
  }
}
function emptyLayout(): Step4Layout {
  return {
    volumes: [{ name: '第一卷', chapters: [{ title: '第 1 章', outline: '' }] }],
    rules: { targetWords: '', forbidden: '', styleNotes: '' }
  }
}

const STEP_LABELS = ['基调', '内核', '世界构建', '结构', '开笔']
const STEP_HINTS = [
  '选一个文风参考',
  '一句话锁定故事核心',
  '起草世界观设定',
  '规划分卷与章节大纲',
  '开始写正文'
]

const completedCount = computed(
  () => Object.values(steps.value).filter((s) => s.isDone).length
)

async function loadAll(): Promise<void> {
  if (!isElectron) {
    loading.value = false
    return
  }
  try {
    const [booksRes, genesisRes] = await Promise.all([
      window.api.books.list(),
      window.api.genesis.get(bookId.value)
    ])
    if (!booksRes.ok) throw new Error(booksRes.error)
    if (!genesisRes.ok) throw new Error(genesisRes.error)
    book.value = booksRes.data.find((b) => b.id === bookId.value) ?? null
    for (const r of genesisRes.data) steps.value[r.step] = r
    // 回填本地编辑态
    if (steps.value[1]?.data) step1.value = steps.value[1].data as Step1Style
    if (steps.value[2]?.data) step2.value = steps.value[2].data as Step2Soul
    if (steps.value[3]?.data) step3.value = steps.value[3].data as Step3World
    if (steps.value[4]?.data) step4.value = steps.value[4].data as Step4Layout
    if (steps.value[5]?.data) step5.value = steps.value[5].data as Step5Write
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

/**
 * 保存某步到 DB（自动判定 isDone）。
 * 注意：data 必须先 toRaw 去响应式——Vue 3 reactive Proxy 无法被 Electron
 * 结构化克隆跨进程传递，否则抛 "An object could not be cloned."（M5 验收 P0）
 */
async function saveStep(step: GenesisStep, data: unknown, isDone?: boolean): Promise<void> {
  const plain = JSON.parse(JSON.stringify(toRaw(data as object))) as unknown
  const res = await window.api.genesis.saveStep(bookId.value, step, plain as never, isDone ?? false)
  if (!res.ok) throw new Error(res.error)
  steps.value[step] = res.data
}

// ---- 第 1 步 基调 ----
async function selectStyle(styleId: string, styleName: string): Promise<void> {
  step1.value = { styleId, styleName }
  try {
    await saveStep(1, step1.value, true)
    toast.success(`已绑定文风：${styleName}`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  }
}

// ---- 第 2 步 内核 ----
async function saveSoul(): Promise<void> {
  try {
    await saveStep(2, step2.value, !!step2.value.logline.trim())
    toast.success('内核已保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  }
}

async function aiAssistSoul(): Promise<void> {
  if (isBusy || !book.value) return
  isBusy = true
  aiPanelKind.value = 'soul'
  aiPanelVisible.value = true
  aiPanel.value?.reset()
  try {
    const messages = buildSoulAssistMessages(book.value, step1.value.styleId || undefined)
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
    toast.error(err instanceof Error ? err.message : '生成失败')
  } finally {
    isBusy = false
  }
}

/** 采纳内核辅助：解析 JSON 后按字段合并（仅覆盖 AI 给出的非空字段，保留用户已填内容） */
function acceptSoulAssist(text: string): void {
  const parsed = parseSoulAssist(text)
  if (!parsed) {
    toast.error('AI 输出格式异常，无法解析。可手动复制有用部分')
    return
  }
  const cur = step2.value
  const mergeStr = (old: string, neu: string): string => (neu.trim() ? neu : old)
  step2.value = {
    logline: mergeStr(cur.logline, parsed.logline),
    genre: {
      mainType: mergeStr(cur.genre.mainType, parsed.genre.mainType),
      subType: mergeStr(cur.genre.subType, parsed.genre.subType),
      targetReader: mergeStr(cur.genre.targetReader, parsed.genre.targetReader),
      mood: mergeStr(cur.genre.mood, parsed.genre.mood)
    },
    cheat: {
      coreAbility: mergeStr(cur.cheat.coreAbility, parsed.cheat.coreAbility),
      powerSystem: mergeStr(cur.cheat.powerSystem, parsed.cheat.powerSystem),
      limitation: mergeStr(cur.cheat.limitation, parsed.cheat.limitation)
    },
    conflict: {
      opening: mergeStr(cur.conflict.opening, parsed.conflict.opening),
      mainline: mergeStr(cur.conflict.mainline, parsed.conflict.mainline),
      ultimate: mergeStr(cur.conflict.ultimate, parsed.conflict.ultimate),
      villain: mergeStr(cur.conflict.villain, parsed.conflict.villain)
    }
  }
  closeAiPanel()
  toast.success('已填入故事核心设定，请检查后保存')
}

// ---- 第 3 步 世界构建起草 ----
async function coldStartWorld(): Promise<void> {
  if (isBusy) return
  if (!step2.value.logline.trim()) {
    toast.error('请先完成「内核」再起草世界构建')
    return
  }
  if (!book.value) return
  isBusy = true
  aiPanelKind.value = 'world'
  aiPanelVisible.value = true
  aiPanel.value?.reset()
  try {
    const messages = buildWorldColdStartMessages(book.value, step2.value, step1.value.styleId || undefined)
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
    toast.error(err instanceof Error ? err.message : '生成失败')
  } finally {
    isBusy = false
  }
}

/** 采纳世界构建起草：解析四段存入 step3 */
async function acceptWorldColdStart(text: string): Promise<void> {
  const parsed = parseWorldColdStart(text)
  if (!parsed.bookOutline && !parsed.volumeOutline && !parsed.worldRules && !parsed.protagonist) {
    toast.error('AI 输出无法识别分段，可手动复制')
    return
  }
  const world: Step3World = { ...parsed, generatedAt: new Date().toISOString() }
  step3.value = world
  try {
    await saveStep(3, world, true)
    closeAiPanel()
    toast.success('世界观设定已生成并保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  }
}

// ---- 推送设定到设定集（M10.5 管道 E；与设定集页「从构思台导入」同一映射，M10.6 统一 isWikiNameDup 幂等） ----
const pushingWiki = ref(false)

async function pushWorldToWiki(): Promise<void> {
  if (!step3.value || pushingWiki.value) return
  pushingWiki.value = true
  try {
    const wikiRes = await window.api.wiki.list(bookId.value)
    if (!wikiRes.ok) throw new Error(wikiRes.error)
    const existing = wikiRes.data
    let created = 0
    for (const entry of genesisToWorldEntries(step3.value)) {
      if (existing.some((w) => isWikiNameDup(entry.name, entry.type, w.name, w.type))) continue
      const res = await window.api.wiki.create({ bookId: bookId.value, ...entry })
      if (!res.ok) throw new Error(res.error)
      existing.push(res.data)
      created++
    }
    toast.success(created > 0 ? `已推送 ${created} 个设定词条到设定集` : '设定词条已存在，无需推送')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '推送失败')
  } finally {
    pushingWiki.value = false
  }
}

// ---- 第 4 步 结构 ----
function addVolume(): void {
  step4.value.volumes.push({ name: `第 ${step4.value.volumes.length + 1} 卷`, chapters: [] })
}
function addChapter(vi: number): void {
  const v = step4.value.volumes[vi]
  v.chapters.push({ title: `第 ${v.chapters.length + 1} 章`, outline: '' })
}
function removeChapter(vi: number, ci: number): void {
  step4.value.volumes[vi].chapters.splice(ci, 1)
}
function removeVolume(vi: number): void {
  step4.value.volumes.splice(vi, 1)
}
async function saveLayout(): Promise<void> {
  try {
    const hasChapter = step4.value.volumes.some((v) => v.chapters.length > 0)
    await saveStep(4, step4.value, hasChapter)
    toast.success('结构已保存')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  }
}

// ---- 第 5 步 开笔 ----
async function startWriting(): Promise<void> {
  try {
    await saveStep(5, { started: true }, true)
    toast.success('设定已就绪，进入写作台')
    router.push(`/book/${bookId.value}/write`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  }
}

// ---- AI 面板通用 ----
function closeAiPanel(): void {
  aiPanelVisible.value = false
  isBusy = false
}
function onAiAccept(text: string): void {
  if (aiPanelKind.value === 'soul') acceptSoulAssist(text)
  else acceptWorldColdStart(text)
}

watch(bookId, () => void loadAll())
onMounted(() => void loadAll())
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 顶栏 -->
    <header class="flex items-center justify-between border-b border-ink-border/60 bg-surface px-8 py-4">
      <div class="flex items-baseline gap-3">
        <router-link :to="`/book/${bookId}/write`" class="text-xs text-ink-text-muted hover:text-ink-primary">← 写作台</router-link>
        <h1 class="text-lg font-bold text-ink-primary">构思台</h1>
        <span class="text-sm text-ink-text-muted">{{ book?.title ?? '…' }}</span>
      </div>
      <span class="text-xs text-ink-text-muted">已完成 {{ completedCount }}/5 步</span>
    </header>

    <!-- 步骤条 -->
    <div class="flex items-center gap-1 border-b border-ink-border/60 bg-surface px-8 py-3">
      <template v-for="(label, i) in STEP_LABELS" :key="i">
        <button
          class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors"
          :class="activeStep === i + 1 ? 'bg-ink-primary text-white' : steps[i + 1]?.isDone ? 'bg-ink-success/15 text-ink-success' : 'text-ink-text-secondary hover:bg-ink-primary-soft'"
          @click="activeStep = (i + 1) as GenesisStep"
        >
          <span class="flex h-5 w-5 items-center justify-center rounded-full text-xs"
            :class="activeStep === i + 1 ? 'bg-white/25' : steps[i + 1]?.isDone ? 'bg-ink-success/25' : 'bg-ink-border/40'">
            {{ steps[i + 1]?.isDone ? '✓' : i + 1 }}
          </span>
          {{ label }}
        </button>
        <span v-if="i < 4" class="text-ink-border">→</span>
      </template>
    </div>

    <!-- 内容区 -->
    <div class="min-h-0 flex-1 overflow-y-auto px-8 py-6">
      <div v-if="loading" class="py-24 text-center text-ink-text-muted">加载中…</div>

      <!-- 第 1 步 基调 -->
      <div v-else-if="activeStep === 1" class="mx-auto max-w-3xl">
        <h2 class="mb-1 text-lg font-semibold">基调 · 选择文风</h2>
        <p class="mb-6 text-sm text-ink-text-secondary">{{ STEP_HINTS[0] }}——绑定后，AI 写作会自动贴近这个调性。</p>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div
            v-for="s in PRESET_STYLES"
            :key="s.id"
            class="cursor-pointer rounded-card border-2 p-4 transition-all hover:shadow-card"
            :class="step1.styleId === s.id ? 'border-ink-primary bg-ink-primary-soft/50' : 'border-ink-border'"
            @click="selectStyle(s.id, s.name)"
          >
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">{{ s.name }}</h3>
              <span v-if="step1.styleId === s.id" class="text-xs text-ink-primary">已绑定 ✓</span>
            </div>
            <p class="mt-1 text-sm text-ink-text-secondary">{{ s.description }}</p>
            <p class="mt-3 rounded-lg bg-paper px-3 py-2 text-sm italic text-ink-text-muted">「{{ s.sample }}」</p>
          </div>
        </div>
      </div>

      <!-- 第 2 步 内核 -->
      <div v-else-if="activeStep === 2" class="mx-auto max-w-3xl">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">内核 · 故事核心</h2>
            <p class="text-sm text-ink-text-secondary">{{ STEP_HINTS[1] }}——这是 AI 后续创作的最高指令。</p>
          </div>
          <button class="rounded-full border border-ink-primary px-3 py-1.5 text-sm text-ink-primary transition-colors hover:bg-ink-primary-soft" @click="aiAssistSoul">AI 辅助起草</button>
        </div>

        <label class="mb-4 flex flex-col gap-1.5">
          <span class="text-sm font-medium">核心一句话 *</span>
          <textarea v-model="step2.logline" rows="2" maxlength="200" placeholder="主角是谁、想做什么、面对什么阻碍" class="resize-none rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary" />
        </label>

        <div class="mb-6 grid grid-cols-2 gap-4">
          <fieldset class="rounded-card border border-ink-border p-4">
            <legend class="px-2 text-sm font-medium">题材定位</legend>
            <div class="flex flex-col gap-2">
              <input v-model="step2.genre.mainType" placeholder="主类型" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
              <input v-model="step2.genre.subType" placeholder="副类型" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
              <input v-model="step2.genre.targetReader" placeholder="目标读者" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
              <input v-model="step2.genre.mood" placeholder="情绪基调" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
            </div>
          </fieldset>
          <fieldset class="rounded-card border border-ink-border p-4">
            <legend class="px-2 text-sm font-medium">核心能力设定</legend>
            <div class="flex flex-col gap-2">
              <input v-model="step2.cheat.coreAbility" placeholder="核心能力" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
              <input v-model="step2.cheat.powerSystem" placeholder="力量体系" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
              <input v-model="step2.cheat.limitation" placeholder="限制代价" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
            </div>
          </fieldset>
        </div>

        <fieldset class="mb-6 rounded-card border border-ink-border p-4">
          <legend class="px-2 text-sm font-medium">冲突梯队</legend>
          <div class="grid grid-cols-2 gap-3">
            <input v-model="step2.conflict.opening" placeholder="开局矛盾" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
            <input v-model="step2.conflict.mainline" placeholder="主线冲突" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
            <input v-model="step2.conflict.ultimate" placeholder="终极阻碍" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
            <input v-model="step2.conflict.villain" placeholder="反派层级" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
          </div>
        </fieldset>

        <button class="rounded-full bg-ink-primary px-6 py-2 text-sm text-white transition-colors hover:bg-ink-primary-hover" @click="saveSoul">保存内核</button>
      </div>

      <!-- 第 3 步 世界构建 -->
      <div v-else-if="activeStep === 3" class="mx-auto max-w-3xl">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">世界构建 · 世界观设定</h2>
            <p class="text-sm text-ink-text-secondary">{{ STEP_HINTS[2] }}——基于内核内容量身生成。</p>
          </div>
          <button class="rounded-full bg-ink-primary px-4 py-1.5 text-sm text-white transition-colors hover:bg-ink-primary-hover" @click="coldStartWorld">一键起草</button>
        </div>

        <div v-if="step3" class="flex flex-col gap-4">
          <div class="flex justify-end">
            <button
              class="rounded-full border border-ink-primary px-4 py-1.5 text-sm text-ink-primary transition-colors hover:bg-ink-primary-soft disabled:opacity-50"
              :disabled="pushingWiki"
              title="把主角设定与世界法则作为词条推送到设定集（已推送过的自动跳过）"
              @click="pushWorldToWiki"
            >{{ pushingWiki ? '推送中…' : '推送设定到设定集' }}</button>
          </div>
          <div v-for="item in [
            { label: '全书大纲', text: step3.bookOutline },
            { label: '第一卷大纲', text: step3.volumeOutline },
            { label: '世界法则', text: step3.worldRules },
            { label: '主角设定', text: step3.protagonist }
          ]" :key="item.label" class="rounded-card border border-ink-border p-4">
            <h3 class="mb-2 font-medium text-ink-primary">{{ item.label }}</h3>
            <p class="whitespace-pre-wrap text-sm leading-7 text-ink-text">{{ item.text || '（空）' }}</p>
          </div>
          <p class="text-xs text-ink-text-muted">生成时间：{{ new Date(step3.generatedAt).toLocaleString('zh-CN') }}</p>
        </div>
        <div v-else class="py-16 text-center">
          <p class="mb-2 text-ink-text-secondary">还没有世界观设定</p>
          <p class="text-sm text-ink-text-muted">点上方「一键起草」，AI 会根据内核内容生成全套设定</p>
        </div>
      </div>

      <!-- 第 4 步 布局 -->
      <div v-else-if="activeStep === 4" class="mx-auto max-w-3xl">
        <h2 class="mb-1 text-lg font-semibold">结构 · 分卷与章节</h2>
        <p class="mb-6 text-sm text-ink-text-secondary">{{ STEP_HINTS[3] }}——写作规则会全局约束 AI 生成。</p>

        <div v-for="(v, vi) in step4.volumes" :key="vi" class="mb-4 rounded-card border border-ink-border p-4">
          <div class="mb-3 flex items-center gap-2">
            <input v-model="v.name" class="flex-1 rounded border border-ink-border px-2 py-1 text-sm font-medium outline-none focus:border-ink-primary" />
            <button class="text-xs text-ink-text-muted hover:text-ink-danger" @click="removeVolume(vi)">删除卷</button>
          </div>
          <div v-for="(c, ci) in v.chapters" :key="ci" class="mb-2 flex items-start gap-2">
            <input v-model="c.title" placeholder="章节名" class="w-32 shrink-0 rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
            <input v-model="c.outline" placeholder="一句话大纲" class="flex-1 rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
            <button class="shrink-0 text-xs text-ink-text-muted hover:text-ink-danger" @click="removeChapter(vi, ci)">✕</button>
          </div>
          <button class="text-xs text-ink-primary hover:underline" @click="addChapter(vi)">+ 添加章节</button>
        </div>
        <button class="mb-6 text-sm text-ink-primary hover:underline" @click="addVolume">+ 添加卷</button>

        <fieldset class="mb-6 rounded-card border border-ink-border p-4">
          <legend class="px-2 text-sm font-medium">写作规则（全局约束 AI 生成）</legend>
          <div class="flex flex-col gap-2">
            <input v-model="step4.rules.targetWords" placeholder="目标总字数（如 100 万字）" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
            <input v-model="step4.rules.forbidden" placeholder="禁止出现的内容" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
            <input v-model="step4.rules.styleNotes" placeholder="要遵循的写法" class="rounded border border-ink-border px-2 py-1 text-sm outline-none focus:border-ink-primary" />
          </div>
        </fieldset>

        <button class="rounded-full bg-ink-primary px-6 py-2 text-sm text-white transition-colors hover:bg-ink-primary-hover" @click="saveLayout">保存布局</button>
      </div>

      <!-- 第 5 步 开笔 -->
      <div v-else-if="activeStep === 5" class="mx-auto max-w-2xl py-12 text-center">
        <h2 class="mb-2 text-lg font-semibold">开笔 · 开始创作</h2>
        <p class="mb-8 text-sm text-ink-text-secondary">{{ STEP_HINTS[4] }}——前四步的设定会自动跟随进入创作流程。</p>
        <div class="mb-8 flex justify-center gap-4 text-sm">
          <span :class="steps[1]?.isDone ? 'text-ink-success' : 'text-ink-text-muted'">{{ steps[1]?.isDone ? '✓' : '○' }} 基调</span>
          <span :class="steps[2]?.isDone ? 'text-ink-success' : 'text-ink-text-muted'">{{ steps[2]?.isDone ? '✓' : '○' }} 内核</span>
          <span :class="steps[3]?.isDone ? 'text-ink-success' : 'text-ink-text-muted'">{{ steps[3]?.isDone ? '✓' : '○' }} 世界构建</span>
          <span :class="steps[4]?.isDone ? 'text-ink-success' : 'text-ink-text-muted'">{{ steps[4]?.isDone ? '✓' : '○' }} 布局</span>
        </div>
        <button class="rounded-full bg-ink-primary px-8 py-3 text-white shadow-card transition-colors hover:bg-ink-primary-hover" @click="startWriting">进入写作台 →</button>
        <p class="mt-4 text-xs text-ink-text-muted">（建议至少完成内核与世界构建，AI 写作效果更好）</p>
      </div>
    </div>

    <!-- AI 面板 -->
    <AiWritingPanel
      ref="aiPanel"
      :visible="aiPanelVisible"
      :kind="aiPanelKind === 'soul' ? 'polish' : 'chapter-polish'"
      @accept="onAiAccept"
      @stop="closeAiPanel"
      @close="closeAiPanel"
    />
  </div>
</template>
