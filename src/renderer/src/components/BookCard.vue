<script setup lang="ts">
/**
 * 书籍卡片：封面（自定义图或渐变+书名首字）+ 书名 + 分类标签 + 简介 + 更新时间。
 * hover 显示操作按钮（删除）；点击卡片进入创作（M3 接路由）。
 * M12：文风绑定（徽标显示 + 绑定弹窗）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Book } from '../../../shared/book.types'
import { BOOK_GENRES } from '../../../shared/book.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import StyleBindDialog from './StyleBindDialog.vue'

const props = defineProps<{ book: Book }>()
const emit = defineEmits<{ delete: [book: Book]; changed: [] }>()
const router = useRouter()
const toast = useToast()

/** 自定义封面 data URL（空=渐变占位）；watch book.cover 变化重载（上传/移除后父层就地替换实体） */
const coverUrl = ref('')
async function loadCover(): Promise<void> {
  coverUrl.value = ''
  if (!isElectron || !props.book.cover) return
  const res = await window.api.books.readCover(props.book.cover)
  if (res.ok) coverUrl.value = res.data
}
watch(() => props.book.cover, () => void loadCover(), { immediate: true })

async function setCover(): Promise<void> {
  if (!isElectron) return
  const res = await window.api.books.setCover(props.book.id)
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  emit('changed', res.data)
}

async function removeCover(): Promise<void> {
  if (!isElectron) return
  const res = await window.api.books.removeCover(props.book.id)
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  toast.success('已移除自定义封面')
  emit('changed', res.data)
}

/** 绑定风格包名（徽标展示；解绑/删除包后降级为空不显示） */
const styleName = ref('')
async function resolveStyleName(): Promise<void> {
  styleName.value = ''
  if (!isElectron || !props.book.styleProfileId) return
  const res = await window.api.styles.list()
  if (res.ok) styleName.value = res.data.find((s) => s.id === props.book.styleProfileId)?.name ?? ''
}
watch(() => props.book.styleProfileId, () => void resolveStyleName(), { immediate: false })
onMounted(() => void resolveStyleName())

const bindVisible = ref(false)

/** 封面渐变按书名 hash 稳定取色，避免每次渲染闪变 */
const coverStyle = computed(() => {
  const palettes = [
    'linear-gradient(135deg,#8a7d62,#5c5342)',
    'linear-gradient(135deg,#6f8a80,#48685f)',
    'linear-gradient(135deg,#b08868,#8a5c42)',
    'linear-gradient(135deg,#7a8aa6,#54618a)',
    'linear-gradient(135deg,#a67f96,#7d5a70)'
  ]
  let h = 0
  for (const ch of props.book.title) h = (h * 31 + ch.codePointAt(0)!) % 997
  return { backgroundImage: palettes[h % palettes.length] }
})

const genreLabel = computed(() =>
  (BOOK_GENRES as readonly string[]).includes(props.book.genre) ? props.book.genre : '未分类'
)

const statusLabel: Record<string, string> = {
  writing: '创作中',
  finished: '已完结',
  archived: '已封存'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** 点击卡片进入写作台 */
function openBook(): void {
  void router.push(`/book/${props.book.id}/write`)
}

/** 进入构思台 */
function openGenesis(): void {
  void router.push(`/book/${props.book.id}/genesis`)
}

/** 进入设定集 */
function openWiki(): void {
  void router.push(`/book/${props.book.id}/wiki`)
}
</script>

<template>
  <div
    class="group relative flex cursor-pointer flex-col overflow-hidden rounded-card bg-surface shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
    @click="openBook"
  >
    <!-- 封面区 -->
    <div class="relative flex h-40 items-center justify-center text-white" :style="coverStyle">
      <img
        v-if="coverUrl"
        :src="coverUrl"
        class="absolute inset-0 h-full w-full object-cover"
        alt=""
      />
      <span v-else class="text-5xl font-bold drop-shadow-md">{{ book.title.slice(0, 1) }}</span>
      <span
        v-if="book.status !== 'writing'"
        class="absolute left-2 top-2 rounded-full bg-black/25 px-2 py-0.5 text-xs"
      >
        {{ statusLabel[book.status] }}
      </span>
      <!-- hover 封面工具（上传/更换/移除） -->
      <div class="absolute bottom-2 right-2 hidden gap-1.5 group-hover:flex">
        <button
          class="rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-white transition-colors hover:bg-black/60"
          @click.stop="setCover"
        >{{ book.cover ? '换封面' : '上传封面' }}</button>
        <button
          v-if="book.cover"
          class="rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-white transition-colors hover:bg-ink-danger"
          @click.stop="removeCover"
        >移除</button>
      </div>
    </div>

    <!-- 信息区 -->
    <div class="flex flex-1 flex-col gap-1.5 p-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="truncate font-semibold">{{ book.title }}</h3>
        <span class="shrink-0 rounded-full bg-ink-primary-soft px-2 py-0.5 text-xs text-ink-primary">
          {{ genreLabel }}
        </span>
      </div>
      <p class="line-clamp-2 min-h-8 text-sm text-ink-text-secondary">
        {{ book.description || '暂无简介' }}
      </p>
      <p class="mt-auto flex items-center gap-1.5 pt-1 text-xs text-ink-text-muted">
        <span
          v-if="styleName"
          class="max-w-[45%] truncate rounded-full bg-ink-primary-soft px-1.5 py-0.5 text-[10px] text-ink-primary"
          :title="`文风：${styleName}`"
        >文风·{{ styleName }}</span>
        <span class="truncate">更新于 {{ formatDate(book.updatedAt) }}</span>
      </p>
      <div class="mt-2 flex gap-1.5">
        <button
          class="flex-1 rounded-lg bg-ink-primary-soft py-1 text-xs text-ink-primary transition-colors hover:bg-ink-primary hover:text-white"
          @click.stop="openBook"
        >写作</button>
        <button
          class="flex-1 rounded-lg border border-ink-border py-1 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
          @click.stop="openGenesis"
        >构思台</button>
        <button
          class="flex-1 rounded-lg border border-ink-border py-1 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
          @click.stop="openWiki"
        >设定</button>
        <button
          class="flex-1 rounded-lg border border-ink-border py-1 text-xs text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
          @click.stop="bindVisible = true"
        >风格</button>
      </div>
    </div>

    <StyleBindDialog v-model="bindVisible" :book="book" @saved="emit('changed', $event)" />

    <!-- 删除按钮：常驻弱显（M15.5 清偿 hover-only 债：触屏/键盘可达），hover 加深为危险色 -->
    <button
      class="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-white/60 opacity-70 transition-colors hover:bg-ink-danger hover:text-white hover:opacity-100 focus:opacity-100"
      title="删除此书"
      @click.stop="emit('delete', book)"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    </button>
  </div>
</template>
