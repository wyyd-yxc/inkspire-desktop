<script setup lang="ts">
/**
 * 创作统计页（M13，零 AI）：总字数与目标进度、今日净增、近 30 天趋势、近 12 月热力图、里程碑。
 * 数据源：stats.list（快照，主进程内嵌记录）+ chapters.listMeta（当前总量）+ books（目标）。
 * 趋势/热力图/里程碑推导在 services/statsCalc 纯函数。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import type { WordSnapshot } from '../../../shared/stats.types'
import type { ChapterMeta } from '../../../shared/chapter.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import {
  buildHeatCells,
  buildTrend,
  computeMilestones,
  heatMonthLabels,
  localDay,
  MILESTONE_STEPS,
  todayDelta
} from '@/services/statsCalc'

const route = useRoute()
const toast = useToast()
const bookId = computed(() => route.params.bookId as string)

const book = ref<Pick<Book, 'title' | 'wordTarget'> | null>(null)
const snapshots = ref<WordSnapshot[]>([])
const chapters = ref<ChapterMeta[]>([])
const loading = ref(true)

/** 字数目标编辑态 */
const targetInput = ref('')
const savingTarget = ref(false)

/** 历史中最早有字数的章节 updatedAt ≈ 首章完稿日（转本地日期，与快照口径一致——黑盒缺陷#2 修复） */
const firstChapterDay = computed(() => {
  const done = chapters.value.filter((c) => c.wordCount > 0)
  if (!done.length) return undefined
  return done.map((c) => localDay(new Date(c.updatedAt))).sort()[0]
})

const totalWords = computed(() => chapters.value.reduce((s, c) => s + c.wordCount, 0))
const today = computed(() => todayDelta(snapshots.value))

const trend = computed(() => buildTrend(snapshots.value, 30))
const heatCells = computed(() => buildHeatCells(snapshots.value, 12))
const heatLabels = computed(() => heatMonthLabels(heatCells.value))
const milestones = computed(() =>
  computeMilestones(snapshots.value, {
    totalWords: totalWords.value,
    hasChapter: chapters.value.some((c) => c.wordCount > 0),
    firstChapterDay: firstChapterDay.value
  })
)

const HEAT_CLASS: Record<number, string> = {
  0: 'bg-heat-0',
  1: 'bg-heat-1',
  2: 'bg-heat-2',
  3: 'bg-heat-3',
  4: 'bg-heat-4'
}

/** 趋势 SVG（viewBox 固定坐标系，等比缩放）：0 线在下方，正向上升，负向沉底 */
const TREND_W = 720
const TREND_H = 160
const trendPoints = computed(() => {
  const pts = trend.value
  if (!pts.length) return ''
  const maxAbs = Math.max(1, ...pts.map((p) => Math.abs(p.delta)))
  const step = TREND_W / Math.max(1, pts.length - 1)
  const zeroY = TREND_H - 24
  const amp = zeroY - 12
  return pts
    .map((p, i) => {
      const x = (i * step).toFixed(1)
      const y = (zeroY - (p.delta / maxAbs) * amp).toFixed(1)
      return `${x},${y}`
    })
    .join(' ')
})
const trendZeroY = TREND_H - 24

async function load(): Promise<void> {
  if (!isElectron) return
  loading.value = true
  try {
    const [statsRes, chaptersRes, booksRes] = await Promise.all([
      window.api.stats.list(bookId.value),
      window.api.chapters.listMeta(bookId.value),
      window.api.books.list()
    ])
    if (!statsRes.ok) throw new Error(statsRes.error)
    if (!chaptersRes.ok) throw new Error(chaptersRes.error)
    if (!booksRes.ok) throw new Error(booksRes.error)
    snapshots.value = statsRes.data
    chapters.value = chaptersRes.data
    book.value = booksRes.data.find((b) => b.id === bookId.value) ?? null
    targetInput.value = book.value?.wordTarget != null ? String(book.value.wordTarget) : ''
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '统计加载失败')
  } finally {
    loading.value = false
  }
}

async function saveTarget(): Promise<void> {
  if (!isElectron || savingTarget.value) return
  // type=number 的 v-model 绑定为 number（空串除外）——先归一为字符串再校验（自测 T1 抓到的真 bug）
  const raw = String(targetInput.value ?? '').trim()
  const n = raw ? Number(raw) : null
  if (raw && (!n || !Number.isFinite(n) || n <= 0)) {
    toast.error('目标需为正整数')
    return
  }
  savingTarget.value = true
  try {
    const res = await window.api.books.update(bookId.value, { wordTarget: n })
    if (!res.ok) throw new Error(res.error)
    book.value = res.data
    targetInput.value = res.data.wordTarget != null ? String(res.data.wordTarget) : ''
    toast.success(res.data.wordTarget != null ? '字数目标已保存' : '字数目标已清除')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    savingTarget.value = false
  }
}

const targetProgress = computed(() => {
  const t = book.value?.wordTarget
  if (!t || t <= 0) return null
  return { percent: Math.min(100, Math.round((totalWords.value / t) * 100)), target: t }
})

watch(bookId, () => void load())
onMounted(() => {
  void load()
})
</script>

<template>
  <div class="flex h-full">
    <!-- 左栏：里程碑 -->
    <aside class="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-ink-border/60 bg-surface">
      <div class="border-b border-ink-border/60 px-4 py-3">
        <router-link :to="`/book/${bookId}/write`" class="text-xs text-ink-text-muted hover:text-ink-primary">← 写作台</router-link>
        <p class="mt-2 text-sm font-semibold">创作统计</p>
        <p class="truncate text-xs text-ink-text-muted" :title="book?.title">{{ book?.title ?? '…' }}</p>
      </div>
      <div class="px-3 py-3">
        <p class="mb-2 text-xs text-ink-text-muted">里程碑</p>
        <div
          v-for="m in milestones"
          :key="m.label + m.target"
          class="mb-1.5 rounded-lg px-2.5 py-1.5 text-sm"
          :class="m.achievedDay ? 'bg-ink-primary-soft/60' : ''"
        >
          <div class="flex items-center justify-between">
            <span :class="m.achievedDay ? 'font-medium text-ink-primary' : 'text-ink-text-secondary'">
              {{ m.achievedDay ? '✓' : '○' }} {{ m.label }}
            </span>
            <span v-if="!m.achievedDay && m.gap !== undefined" class="text-[10px] text-ink-text-muted">
              还差 {{ m.gap.toLocaleString('zh-CN') }} 字
            </span>
          </div>
          <p v-if="m.achievedDay" class="mt-0.5 text-[10px] text-ink-text-muted">达成于 {{ m.achievedDay }}</p>
        </div>
        <p class="mt-2 text-[10px] leading-4 text-ink-text-muted">
          字数阶梯：{{ MILESTONE_STEPS.map((s) => s.label).join(' / ') }}。<br />统计自 M13 上线起积累，此前写作不回填。
        </p>
      </div>
    </aside>

    <!-- 主区 -->
    <main class="min-w-0 flex-1 overflow-y-auto">
      <div v-if="loading" class="py-20 text-center text-sm text-ink-text-muted">加载中…</div>
      <template v-else>
        <!-- 指标行 -->
        <div class="grid grid-cols-3 gap-3 p-5">
          <div class="rounded-card border border-ink-border bg-surface p-4 shadow-card">
            <p class="text-xs text-ink-text-muted">总字数</p>
            <p class="mt-1 font-serif text-2xl font-semibold text-ink-primary">{{ totalWords.toLocaleString('zh-CN') }}</p>
            <p class="mt-1 text-[10px] text-ink-text-muted">全书 {{ chapters.length }} 章</p>
          </div>
          <div class="rounded-card border border-ink-border bg-surface p-4 shadow-card">
            <p class="text-xs text-ink-text-muted">今日净增</p>
            <p class="mt-1 font-serif text-2xl font-semibold" :class="today > 0 ? 'text-ink-success' : today < 0 ? 'text-ink-danger' : 'text-ink-text-secondary'">
              {{ today > 0 ? '+' : '' }}{{ today.toLocaleString('zh-CN') }}
            </p>
            <p class="mt-1 text-[10px] text-ink-text-muted">{{ localDay(new Date()) }}</p>
          </div>
          <div class="rounded-card border border-ink-border bg-surface p-4 shadow-card">
            <p class="text-xs text-ink-text-muted">字数目标</p>
            <template v-if="targetProgress">
              <p class="mt-1 font-serif text-2xl font-semibold text-ink-primary">{{ targetProgress.percent }}%</p>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-heat-0">
                <div class="h-full rounded-full bg-ink-primary" :style="{ width: targetProgress.percent + '%' }" />
              </div>
              <p class="mt-1 text-[10px] text-ink-text-muted">目标 {{ targetProgress.target.toLocaleString('zh-CN') }} 字</p>
            </template>
            <p v-else class="mt-1 text-sm text-ink-text-muted">未设置</p>
            <div class="mt-2 flex items-center gap-1.5">
              <input
                v-model="targetInput"
                type="number"
                min="1"
                placeholder="如 200000"
                class="w-24 rounded border border-ink-border px-2 py-0.5 text-xs outline-none focus:border-ink-primary"
              />
              <button
                class="rounded border border-ink-primary px-2 py-0.5 text-xs text-ink-primary transition-colors hover:bg-ink-primary-soft disabled:opacity-40"
                :disabled="savingTarget"
                @click="saveTarget"
              >保存</button>
            </div>
          </div>
        </div>

        <!-- 近 30 天趋势 -->
        <section class="mx-5 mb-4 rounded-card border border-ink-border bg-surface p-4 shadow-card">
          <h2 class="mb-2 text-sm font-semibold">近 30 天每日净增</h2>
          <svg :viewBox="`0 0 ${TREND_W} ${TREND_H}`" class="block w-full" role="img" aria-label="近 30 天每日净增趋势">
            <line :x1="0" :y1="trendZeroY" :x2="TREND_W" :y2="trendZeroY" stroke="#e6dfd1" stroke-width="1" />
            <polyline
              :points="trendPoints"
              fill="none"
              stroke="#3a352e"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
          <p class="mt-1 text-[10px] text-ink-text-muted">
            {{ trend[0]?.day }} — {{ trend[trend.length - 1]?.day }}；纵轴为当日净增字数（基准线以下为净删，如实呈现）。
          </p>
        </section>

        <!-- 近 12 月热力图 -->
        <section class="mx-5 mb-6 rounded-card border border-ink-border bg-surface p-4 shadow-card">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-semibold">近 12 个月</h2>
            <div class="flex items-center gap-1 text-[10px] text-ink-text-muted">
              少
              <span
                v-for="lv in [0, 1, 2, 3, 4]"
                :key="lv"
                class="inline-block h-3 w-3 rounded-sm"
                :class="HEAT_CLASS[lv]"
              />
              多
            </div>
          </div>
          <div class="relative overflow-x-auto pb-1">
            <div class="inline-flex flex-col">
              <!-- 月标签 -->
              <div class="ml-7 flex" style="height: 16px">
                <div
                  v-for="l in heatLabels"
                  :key="l.col + l.label"
                  class="absolute text-[10px] text-ink-text-muted"
                  :style="{ left: 28 + l.col * 15 + 'px' }"
                >{{ l.label }}</div>
              </div>
              <div class="flex">
                <!-- 星期标签 -->
                <div class="mr-1 flex w-6 flex-col justify-between py-0.5 text-[9px] leading-3 text-ink-text-muted">
                  <span>一</span><span>三</span><span>五</span><span>日</span>
                </div>
                <div class="inline-grid grid-flow-col gap-[3px]" style="grid-template-rows: repeat(7, 12px); grid-auto-columns: 12px">
                  <span
                    v-for="cell in heatCells"
                    :key="cell.day"
                    class="h-3 w-3 rounded-sm"
                    :class="HEAT_CLASS[cell.level]"
                    :title="`${cell.day}：净增 ${cell.delta.toLocaleString('zh-CN')} 字`"
                  />
                </div>
              </div>
            </div>
          </div>
          <p class="mt-2 text-[10px] text-ink-text-muted">
            每格一天，颜色按当日净增字数分档（0 / 1-99 / 100-499 / 500-999 / ≥1000）；悬停查看明细。
          </p>
        </section>
      </template>
    </main>
  </div>
</template>
