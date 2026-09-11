<script setup lang="ts">
/**
 * 拆书弹窗（M14）：导入参考 txt → AI 拆解文风 → 勾选候选 → 落风格包（source_type='digest'）。
 * 四态流：import（选文件）→ running（流式拆解，可停止）→ review（复用 SyncCandidateDialog 勾选）→ 落库。
 * 隐私决策：参考文本仅内存传递（不落库不持久），弹窗关闭/流程结束即丢弃。
 */
import { ref, watch } from 'vue'
import type { DigestPickResult, DigestResult } from '../../../../shared/digest.types'
import type { SyncCandidateItem } from '../../../../shared/sync.types'
import { isElectron } from '@/services/books'
import { chatStream, type StreamSession } from '@/services/ai'
import { resolveProfile } from '@/services/aiWriting'
import { buildDigestMessages, parseDigestOutput } from '@/services/digestPrompts'
import { useToast } from '@/composables/useToast'
import SyncCandidateDialog from '@/components/sync/SyncCandidateDialog.vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  'update:visible': [v: boolean]
  saved: []
}>()

const toast = useToast()
const phase = ref<'import' | 'running' | 'review'>('import')
const pick = ref<DigestPickResult | null>(null)
const streamTail = ref('')
const errorMsg = ref('')
const parsed = ref<DigestResult | null>(null)
const candidates = ref<SyncCandidateItem[]>([])
let session: StreamSession | null = null
/** 代次号防竞态（踩坑 #14 同型）：停止/关闭后忽略在途回调 */
let seq = 0

watch(
  () => props.visible,
  (v) => {
    seq++
    session?.abort()
    session = null
    errorMsg.value = ''
    streamTail.value = ''
    if (v) {
      phase.value = 'import'
      pick.value = null
      parsed.value = null
      candidates.value = []
    } else {
      // 隐私：关闭即丢弃参考文本与拆解产物（派生数据一并清空，r2 低危项）
      pick.value = null
      parsed.value = null
      candidates.value = []
    }
  }
)

async function chooseFile(): Promise<void> {
  if (!isElectron) return
  const res = await window.api.digest.pickText()
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  if (!res.data) return // 用户取消选择
  pick.value = res.data
  await startDigest()
}

async function startDigest(): Promise<void> {
  if (!pick.value) return
  const mySeq = ++seq
  errorMsg.value = ''
  streamTail.value = ''
  let full = ''
  try {
    phase.value = 'running' // 先切态给即时反馈；resolveProfile 失败经 fail() 回落导入态
    const profile = await resolveProfile()
    session = await chatStream(profile, buildDigestMessages(pick.value.text), {
      onChunk: (t) => {
        if (mySeq !== seq) return
        full += t
        streamTail.value = full.slice(-400)
      },
      onDone: () => {
        if (mySeq !== seq) return
        session = null
        const d = parseDigestOutput(full)
        if (!d) {
          fail('AI 返回的内容无法解析为风格包，请重试')
          return
        }
        parsed.value = d
        candidates.value = buildCandidates(d)
        phase.value = 'review'
      },
      onError: (msg) => {
        if (mySeq !== seq) return
        session = null
        fail(msg)
      }
    })
    // chatStream 建流期间用户可能已停止/重开——次代号过期则立即中断新流（r2 中等项：防停止漏 abort）
    if (mySeq !== seq) {
      session.abort()
      session = null
      return
    }
  } catch (err) {
    if (mySeq !== seq) return // 已停止/重开：不覆盖其状态
    fail(err instanceof Error ? err.message : '无法启动 AI 拆解')
  }
}

/** 失败回落导入态（保留已导入文本，可直接重试） */
function fail(msg: string): void {
  errorMsg.value = msg
  phase.value = 'import'
}

function stop(): void {
  seq++
  session?.abort()
  session = null
  errorMsg.value = '已停止拆解'
  phase.value = 'import'
}

function buildCandidates(d: DigestResult): SyncCandidateItem[] {
  const items: SyncCandidateItem[] = []
  if (d.tone) items.push({ key: 'tone', title: d.tone, tag: '调性', tagColor: '#6c5ce7', checked: true })
  d.rules.forEach((r, i) => items.push({ key: `rule:${i}`, title: r, tag: '规则', checked: true }))
  if (d.sample) items.push({ key: 'sample', title: d.sample, tag: '样例', tagColor: '#8a7a5c', checked: true })
  return items
}

/** 勾选落库：按 key 归位各字段；全不勾时 SyncCandidateDialog 已禁用确认，此处必有点选 */
async function doCreate(checked: SyncCandidateItem[]): Promise<void> {
  const d = parsed.value
  if (!d || !isElectron) return
  const tone = checked.find((c) => c.key === 'tone')?.title ?? ''
  const rules = checked.filter((c) => c.key.startsWith('rule:')).map((c) => c.title)
  const sample = checked.find((c) => c.key === 'sample')?.title ?? ''
  const res = await window.api.styles.create({
    name: d.name,
    tone,
    rules,
    sample,
    sourceType: 'digest'
  })
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  toast.success(`风格包「${res.data.name}」已生成（来源：拆书）`)
  emit('saved')
  close()
}

function close(): void {
  emit('update:visible', false)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && phase !== 'review'"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      @click.self="close"
    >
      <div class="w-[520px] rounded-2xl bg-surface p-5 shadow-2xl">
        <div class="mb-1 flex items-center justify-between">
          <h2 class="font-semibold">从参考文本拆解风格包</h2>
          <button class="text-ink-text-muted hover:text-ink-text" @click="close">✕</button>
        </div>
        <p class="mb-4 text-xs leading-5 text-ink-text-muted">
          选择一段目标文风的 txt 文本，AI 只拆解文笔风格（调性/叙事规则/样例句段）；
          参考文本仅在拆解时使用，不会保存。
        </p>

        <template v-if="phase === 'import'">
          <button
            class="w-full rounded-xl border border-dashed border-ink-border py-8 text-sm text-ink-text-secondary transition-colors hover:border-ink-primary hover:text-ink-primary"
            @click="chooseFile"
          >📁 选择 txt 参考文本</button>
          <p class="mt-2 text-[11px] text-ink-text-muted">
            仅支持 UTF-8 编码的 txt；超过 2 万字会自动截取开头部分。
          </p>
          <p
            v-if="errorMsg"
            class="mt-3 rounded-lg bg-ink-danger/10 px-3 py-2 text-xs leading-5 text-ink-danger"
          >{{ errorMsg }}</p>
        </template>

        <template v-else>
          <div class="rounded-xl bg-paper px-4 py-3">
            <p class="text-xs text-ink-text-secondary">
              {{ pick?.fileName }} · 共 {{ pick?.totalChars?.toLocaleString() }} 字<template v-if="pick?.truncated">，已截取前 2 万字</template>
            </p>
            <pre class="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-all text-[11px] leading-4 text-ink-text-muted">{{ streamTail || '正在连接 AI…' }}</pre>
          </div>
          <div class="mt-3 flex items-center justify-between text-xs text-ink-text-muted">
            <span>正在拆解文风…</span>
            <button class="text-ink-text-secondary hover:text-ink-danger" @click="stop">停止</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>

  <SyncCandidateDialog
    :visible="visible && phase === 'review'"
    title="采纳拆解结果"
    :description="`将生成风格包「${parsed?.name ?? ''}」（来源：拆书），勾选要纳入的内容；取消则不生成。`"
    confirm-text="生成风格包"
    :items="candidates"
    @confirm="doCreate"
    @close="close"
  />
</template>
