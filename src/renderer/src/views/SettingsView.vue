<script setup lang="ts">
/**
 * 设置中心：AI 接口档案管理（列表/新建/编辑/删除/设为默认/快速测试）。
 * 档案是后续所有 AI 功能（续写/润色/助手/Agent）的模型来源，支持多套并存。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ApiProfile } from '../../../shared/ai.types'
import { isElectron } from '../services/books'
import { useToast } from '@/composables/useToast'
import ApiProfileDialog from '@/components/ApiProfileDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const toast = useToast()
const profiles = ref<ApiProfile[]>([])
const defaultId = ref('')
const loading = ref(true)

const showEditor = ref(false)
const editing = ref<ApiProfile | null>(null)
const pendingDelete = ref<ApiProfile | null>(null)

// 快速测试（列表行内）
const testingId = ref('')
const testText = ref('')
const testStatus = ref<'' | 'ok' | 'fail'>('')
const testInfo = ref('')

async function refresh(): Promise<void> {
  if (!isElectron) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [listRes, defRes] = await Promise.all([
      window.api.apiProfiles.list(),
      window.api.settings.get<string>('ai.default_profile_id', '')
    ])
    if (!listRes.ok) throw new Error(listRes.error)
    if (!defRes.ok) throw new Error(defRes.error)
    profiles.value = listRes.data
    defaultId.value = defRes.data
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editing.value = null
  showEditor.value = true
}

function openEdit(p: ApiProfile): void {
  editing.value = p
  showEditor.value = true
}

/** 设为默认档案 */
async function setDefault(p: ApiProfile): Promise<void> {
  try {
    const res = await window.api.settings.set('ai.default_profile_id', p.id)
    if (!res.ok) throw new Error(res.error)
    defaultId.value = p.id
    toast.success(`「${p.name}」已设为默认`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '设置失败')
  }
}

async function doDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target) return
  try {
    const res = await window.api.apiProfiles.remove(target.id)
    if (!res.ok) throw new Error(res.error)
    // 删除的是默认档案时清空默认指向
    if (defaultId.value === target.id) {
      await window.api.settings.set('ai.default_profile_id', '')
      defaultId.value = ''
    }
    toast.success(`「${target.name}」已删除`)
    await refresh()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '删除失败')
  } finally {
    pendingDelete.value = null
  }
}

/** 行内快速连通测试 */
async function quickTest(p: ApiProfile): Promise<void> {
  testingId.value = p.id
  testText.value = ''
  testStatus.value = ''
  testInfo.value = ''
  const { chatStream } = await import('../services/ai')
  try {
    const session = await chatStream(p, [{ role: 'user', content: '回复「连接成功」四个字。' }], {
      onChunk: (t) => {
        testText.value += t
      },
      onDone: (info) => {
        testStatus.value = 'ok'
        testInfo.value = `首字 ${info.firstTokenMs}ms · 总 ${(info.totalMs / 1000).toFixed(1)}s`
      },
      onError: (m) => {
        testStatus.value = 'fail'
        testInfo.value = m
      }
    })
    quickSession = session
  } catch (err) {
    testStatus.value = 'fail'
    testInfo.value = err instanceof Error ? err.message : '测试失败'
    testingId.value = ''
  }
}

let quickSession: { abort: () => void } | null = null
onBeforeUnmount(() => quickSession?.abort())

onMounted(refresh)
</script>

<template>
  <div class="h-full overflow-y-auto">
    <header class="sticky top-0 z-10 flex items-center justify-between border-b border-ink-border/60 bg-paper/80 px-8 py-4 backdrop-blur">
      <div class="flex items-baseline gap-3">
        <h1 class="text-xl font-bold tracking-widest text-ink-primary">墨灵</h1>
        <span class="text-sm text-ink-text-muted">设置中心</span>
      </div>
      <router-link to="/" class="text-sm text-ink-text-secondary transition-colors hover:text-ink-primary">
        ← 返回书斋
      </router-link>
    </header>

    <main class="mx-auto max-w-3xl px-8 py-6">
      <section class="mb-6 rounded-card bg-surface p-5 shadow-card">
        <h2 class="mb-1 font-semibold">AI 接口档案</h2>
        <p class="mb-4 text-sm leading-relaxed text-ink-text-secondary">
          配置你自己的大模型 API（OpenAI 兼容协议，支持 OpenRouter、DeepSeek、智谱、各类中转站等）。
          可以建多套档案分别用于速写和精修；密钥只保存在你的电脑上。
        </p>
        <button
          class="rounded-full bg-ink-primary px-4 py-2 text-sm text-white transition-colors hover:bg-ink-primary-hover"
          @click="openCreate"
        >
          + 新建档案
        </button>
      </section>

      <div v-if="loading" class="py-16 text-center text-ink-text-muted">加载中…</div>

      <div v-else-if="profiles.length === 0" class="py-16 text-center text-ink-text-secondary">
        还没有 API 档案。点上方「新建档案」，填入地址、Key 和模型名即可开始使用 AI 功能。
      </div>

      <div v-else class="flex flex-col gap-3">
        <div
          v-for="p in profiles"
          :key="p.id"
          class="rounded-card bg-surface p-4 shadow-card transition-shadow hover:shadow-lg"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{{ p.name }}</span>
            <span
              v-if="p.id === defaultId"
              class="rounded-full bg-ink-primary-soft px-2 py-0.5 text-xs text-ink-primary"
            >默认</span>
            <span class="rounded-full border border-ink-border px-2 py-0.5 text-xs text-ink-text-muted">
              {{ p.providerKind === 'openai-compatible' ? 'OpenAI 兼容' : p.providerKind }}
            </span>
            <div class="ml-auto flex items-center gap-2 text-sm">
              <button
                v-if="p.id !== defaultId"
                class="text-ink-text-secondary transition-colors hover:text-ink-primary"
                @click="setDefault(p)"
              >设为默认</button>
              <span class="text-ink-border">|</span>
              <button
                class="text-ink-text-secondary transition-colors hover:text-ink-primary"
                :disabled="testingId === p.id"
                @click="quickTest(p)"
              >{{ testingId === p.id ? '测试中…' : '测试' }}</button>
              <span class="text-ink-border">|</span>
              <button
                class="text-ink-text-secondary transition-colors hover:text-ink-primary"
                @click="openEdit(p)"
              >编辑</button>
              <span class="text-ink-border">|</span>
              <button
                class="text-ink-text-secondary transition-colors hover:text-ink-danger"
                @click="pendingDelete = p"
              >删除</button>
            </div>
          </div>
          <p class="mt-1 text-sm text-ink-text-muted">
            {{ p.model }} · {{ p.baseUrl }}
          </p>
          <p
            v-if="testingId === p.id && (testText || testInfo)"
            class="mt-2 whitespace-pre-wrap rounded-lg bg-paper px-3 py-2 text-sm"
            :class="testStatus === 'fail' ? 'text-ink-danger' : testStatus === 'ok' ? 'text-ink-success' : 'text-ink-text-secondary'"
          >{{ testText || testInfo }}{{ testStatus === 'ok' && testInfo ? `（${testInfo}）` : testStatus === 'fail' ? `：${testInfo}` : '' }}</p>
        </div>
      </div>
    </main>

    <ApiProfileDialog v-model="showEditor" :editing="editing" @saved="refresh" />
    <ConfirmDialog
      :model-value="pendingDelete !== null"
      @update:model-value="pendingDelete = null"
      :title="`删除档案「${pendingDelete?.name ?? ''}」？`"
      description="删除后使用该档案的 AI 功能将不可用，直到配置新档案。"
      @confirm="doDelete"
    />
  </div>
</template>
