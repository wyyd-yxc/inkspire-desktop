# M10 剧情画布 — 验收材料（第三轮补充：静态盲区消除 + 二轮整改实证）

> 本轮只补第二轮审查（llm-review-2026-09-06-06-58）声明的剩余盲区与条件项，
> 主体材料见 material-M10-plot-canvas.md（第一轮）与 material-M10-plot-canvas-r2.md（第二轮，含渲染层全量源码）。
> 验收点清单以 material-M10-plot-canvas.md 为准。

## 二轮条件项处置实证

| 二轮条件 | 处置 |
|---|---|
| P1 跨书归属校验「显式注释登记」 | **已整改**（commit c610314）：`src/main/ipc/plot.ts` assertWikiRefs 注释块明确登记「只验格式不验归属 + 信任边界依据 + 后续升级路径」 |
| P2 延伸落位仅 1 行避让 | **已整改**（commit c610314）：`freeRowYAfter` 改为逐行下移最多 5 行（与 adoptDirection 同策略）。复测 `tmp/m10-t2c.mjs`：y=240/460 两排被占时新事件落 y=680，锚点→新链主线边正确，无 console 报错，数据自清 |
| P2 stopEverything 提前释放 isBusy | **已整改**（commit c610314）：`stopEverything` 只 abort，isBusy 由 startPlotGen 的 finally 在流终结后统一释放（中止 → onError('已中止') → generateWriting resolve → finally） |
| P2 延伸上下文「无描述事件只有标题占位」 | 登记为已知 UX 边界（提示用户延伸前补全描述），不改代码 |

## 附录 A：被 diff 截断的入口文件源码

### src/renderer/src/router/index.ts（剧情路由注册）
```ts
/**
 * 路由表。路径与功能模块的对应关系见 docs/design/architecture.md 第 4 节。
 * M0 仅有书斋占位页，后续里程碑逐个补齐。
 */
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  // Electron 加载本地文件，必须用 hash 模式
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'bookshelf',
      component: () => import('@/views/BookshelfView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue')
    },
    {
      path: '/book/:bookId/write',
      name: 'workspace',
      component: () => import('@/views/WorkspaceView.vue')
    },
    {
      path: '/book/:bookId/genesis',
      name: 'genesis',
      component: () => import('@/views/GenesisView.vue')
    },
    {
      path: '/book/:bookId/wiki',
      name: 'wiki',
      component: () => import('@/views/WikiView.vue')
    },
    {
      path: '/book/:bookId/canvas/:chapterId',
      name: 'canvas',
      component: () => import('@/views/CanvasView.vue')
    },
    {
      path: '/book/:bookId/plot',
      name: 'plot',
      component: () => import('@/views/PlotCanvasView.vue')
    },
    {
      path: '/book/:bookId/memory',
      name: 'memory',
      component: () => import('@/views/MemoryView.vue')
    }
  ]
})

export default router
```

### src/renderer/src/components/ChapterSidebar.vue（「剧情」入口链接）
```vue
<script setup lang="ts">
/**
 * 章节侧栏：章节列表（新增/选中/重命名/删除/上下移），底部显示全书总字数。
 * 重命名采用行内编辑（双击或按钮进入编辑态）。
 */
import { computed, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import type { Chapter } from '../../../shared/chapter.types'

const props = defineProps<{
  chapters: Chapter[]
  activeId: string
  totalWords: number
  bookTitle: string
  bookId: string
}>()

const emit = defineEmits<{
  create: []
  select: [chapter: Chapter]
  rename: [id: string, title: string]
  remove: [chapter: Chapter]
  move: [id: string, dir: -1 | 1]
}>()

const router = useRouter()

const editingId = ref('')
const editingTitle = ref('')
/** v-for 内的函数式 ref 收集（Vue3 中 v-for 的字符串 ref 是数组，改用 id 映射避免误用） */
const editInputs = new Map<string, HTMLInputElement>()

function setEditInputRef(id: string, el: unknown): void {
  if (el instanceof HTMLInputElement) editInputs.set(id, el)
  else editInputs.delete(id)
}

/** 进入重命名编辑态 */
async function startRename(c: Chapter): Promise<void> {
  editingId.value = c.id
  editingTitle.value = c.title
  await nextTick()
  const input = editInputs.get(c.id)
  input?.focus()
  input?.select()
}

/** 提交重命名 */
function commitRename(): void {
  const id = editingId.value
  const title = editingTitle.value.trim()
  editingId.value = ''
  if (id && title) emit('rename', id, title)
}

const wordsLabel = computed(() => props.totalWords.toLocaleString('zh-CN'))
</script>

<template>
  <aside class="flex h-full w-60 shrink-0 flex-col border-r border-ink-border/60 bg-surface">
    <!-- 书籍信息 -->
    <div class="border-b border-ink-border/60 px-4 py-3">
      <div class="flex items-center justify-between gap-2">
        <router-link
          to="/"
          class="flex items-center gap-1 text-xs text-ink-text-muted transition-colors hover:text-ink-primary"
        >
          ← 书斋
        </router-link>
        <div class="flex items-center gap-1.5">
          <router-link
            :to="`/book/${bookId}/genesis`"
            class="rounded-full border border-ink-border px-2 py-0.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
            title="创世台"
          >创世台</router-link>
          <router-link
            :to="`/book/${bookId}/wiki`"
            class="rounded-full border border-ink-border px-2 py-0.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
            title="万物百科"
          >百科</router-link>
          <router-link
            :to="`/book/${bookId}/plot`"
            class="rounded-full border border-ink-border px-2 py-0.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
            title="剧情画布"
          >剧情</router-link>
          <router-link
            :to="`/book/${bookId}/memory`"
            class="rounded-full border border-ink-border px-2 py-0.5 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
            title="作品记忆"
          >记忆</router-link>
          <button
            class="rounded-full bg-ink-primary px-3 py-1 text-xs text-white transition-colors hover:bg-ink-primary-hover"
            @click="emit('create')"
          >+ 新章节</button>
        </div>
      </div>
      <p class="mt-2 truncate text-sm font-semibold" :title="bookTitle">{{ bookTitle }}</p>
    </div>

    <!-- 章节列表 -->
    <div class="flex-1 overflow-y-auto py-2">
      <p v-if="chapters.length === 0" class="px-4 py-8 text-center text-xs text-ink-text-muted">
        还没有章节，点上方「+ 新章节」开始
      </p>
      <div
        v-for="(c, i) in chapters"
        :key="c.id"
        class="group mx-2 mb-1 flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 transition-colors"
        :class="c.id === activeId ? 'bg-ink-primary-soft' : 'hover:bg-paper'"
        @click="emit('select', c)"
      >
        <span class="w-5 shrink-0 text-center text-xs text-ink-text-muted">{{ i + 1 }}</span>

        <input
          v-if="editingId === c.id"
          :ref="(el) => setEditInputRef(c.id, el)"
          v-model="editingTitle"
          class="min-w-0 flex-1 rounded border border-ink-primary bg-surface px-1.5 py-0.5 text-sm outline-none"
          @click.stop
          @keyup.enter="commitRename"
          @keyup.escape="editingId = ''"
          @blur="commitRename"
        />
        <template v-else>
          <span class="min-w-0 flex-1 truncate text-sm" :class="c.id === activeId ? 'text-ink-primary font-medium' : ''">
            {{ c.title }}
          </span>
          <span class="shrink-0 text-xs text-ink-text-muted group-hover:hidden">
            {{ c.wordCount ? c.wordCount.toLocaleString('zh-CN') + '字' : '' }}
          </span>
        </template>

        <!-- hover 操作 -->
        <div v-if="editingId !== c.id" class="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-primary"
            title="章节画布"
            @click.stop="router.push(`/book/${props.bookId}/canvas/${c.id}`)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
          </button>
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-primary disabled:opacity-30"
            :disabled="i === 0"
            title="上移"
            @click.stop="emit('move', c.id, -1)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-primary disabled:opacity-30"
            :disabled="i === chapters.length - 1"
            title="下移"
            @click.stop="emit('move', c.id, 1)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-primary"
            title="重命名"
            @click.stop="startRename(c)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button
            class="rounded p-0.5 text-ink-text-muted hover:bg-paper hover:text-ink-danger"
            title="删除章节"
            @click.stop="emit('remove', c)"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 底部统计 -->
    <div class="border-t border-ink-border/60 px-4 py-2.5 text-xs text-ink-text-muted">
      全书共 <span class="font-medium text-ink-text-secondary">{{ chapters.length }}</span> 章 ·
      <span class="font-medium text-ink-text-secondary">{{ wordsLabel }}</span> 字
    </div>
  </aside>
</template>
```

### src/renderer/src/services/plotStyle.ts（四类连线视觉与标签取色）
```ts
/**
 * 剧情画布渲染层样式常量：连线四类型视觉（颜色/线型/展示名）与标签取色。
 * 前三类承接章节画布 M7.5 配色，reference 引用为 M10 新增（绿点线）。
 */
import type { PlotEdgeType } from '../../../shared/plot.types'

export const PLOT_EDGE_STYLES: Record<PlotEdgeType, { stroke: string; dash: string; label: string }> = {
  main: { stroke: '#c9a227', dash: '0', label: '主线' },
  logic: { stroke: '#5b9bd1', dash: '6 4', label: '逻辑' },
  relation: { stroke: '#9d97b5', dash: '2 4', label: '关联' },
  reference: { stroke: '#58a27a', dash: '1 4', label: '引用' }
}

/** 标签色板：事件节点左侧色条按首个标签取色（同一标签恒同色，标签决定节点视觉色，照原站文档） */
const TAG_PALETTE = ['#6c5ce7', '#c9a227', '#5b9bd1', '#3fa66a', '#e07b54', '#8b5fbf', '#d16a8a', '#4aa8a2']

export function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}
```

### src/main/ipc/plot.ts（含 P1 整改后的归属登记注释）
```ts
/**
 * plot 域 IPC：剧情事件（plot:*）与剧情连线（plot-edges:*）CRUD。
 */
import { ipcMain } from 'electron'
import { wrap } from './wrap'
import {
  createPlotEvent,
  listPlotEvents,
  removePlotEvent,
  updatePlotEvent
} from '../db/plot'
import {
  createPlotEdge,
  listPlotEdges,
  removePlotEdge,
  updatePlotEdge
} from '../db/plotEdges'
import type {
  CreatePlotEdgeInput,
  CreatePlotEventInput,
  UpdatePlotEdgeInput,
  UpdatePlotEventInput
} from '../../shared/plot.types'

/** 轻量 UUID 校验（防渲染层传入脏 id 跨书越权，照 sceneEdges M7 静态审查建议） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(...ids: string[]): void {
  for (const id of ids) {
    if (!UUID_RE.test(id)) throw new Error('参数格式非法')
  }
}

/** 校验输入里的词条引用数组（防污染 id 触发下游 wiki 查询异常，M10 静态审查建议）。
 *  设计登记（M10 静态审查 P1）：只验格式不验「词条属于该书」/ 连线两端是否属书——
 *  UUID 随机不可枚举 + 单机单用户信任边界（与 M7 scenes/sceneEdges、apiKey 明文同一边际模型），
 *  若后续做多档/协同再以 migration + DAO 归属校验补齐。 */
function assertWikiRefs(input: { wikiRefs?: string[] }): void {
  for (const rid of input.wikiRefs ?? []) {
    if (!UUID_RE.test(rid)) throw new Error('词条引用格式非法')
  }
}

export function registerPlotIpc(): void {
  ipcMain.handle('plot:list', (_e, bookId: string, parentId?: string) => {
    assertUuid(bookId)
    if (parentId) assertUuid(parentId)
    return wrap(() => listPlotEvents(bookId, parentId))
  })

  ipcMain.handle('plot:create', (_e, input: CreatePlotEventInput) =>
    wrap(() => {
      assertUuid(input.bookId)
      assertWikiRefs(input)
      return createPlotEvent(input)
    })
  )

  ipcMain.handle('plot:update', (_e, id: string, input: UpdatePlotEventInput) =>
    wrap(() => {
      assertUuid(id)
      assertWikiRefs(input)
      return updatePlotEvent(id, input)
    })
  )

  ipcMain.handle('plot:remove', (_e, id: string) =>
    wrap(() => {
      assertUuid(id)
      return removePlotEvent(id)
    })
  )

  ipcMain.handle('plot-edges:list', (_e, bookId: string) => {
    assertUuid(bookId)
    return wrap(() => listPlotEdges(bookId))
  })

  ipcMain.handle('plot-edges:create', (_e, input: CreatePlotEdgeInput) =>
    wrap(() => {
      assertUuid(input.bookId, input.sourceId, input.targetId)
      return createPlotEdge(input)
    })
  )

  ipcMain.handle('plot-edges:update', (_e, id: string, input: UpdatePlotEdgeInput) =>
    wrap(() => {
      assertUuid(id)
      return updatePlotEdge(id, input)
    })
  )

  ipcMain.handle('plot-edges:remove', (_e, id: string) =>
    wrap(() => {
      assertUuid(id)
      return removePlotEdge(id)
    })
  )
}
```
