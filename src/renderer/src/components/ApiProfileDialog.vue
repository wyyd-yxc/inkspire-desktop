<script setup lang="ts">
/**
 * API 档案编辑弹窗（新建/编辑复用）：名称、协议、地址、密钥、模型 + 高级参数折叠区。
 * 支持「保存前先测试」——测试通过再保存，降低配错的挫败感。
 */
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import type {
  AiParams,
  ApiProfile,
  CreateApiProfileInput,
  ProviderKind
} from '../../../shared/ai.types'
import { chatStream } from '../services/ai'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ editing?: ApiProfile | null }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [profile: ApiProfile] }>()

const toast = useToast()
const saving = ref(false)
const showAdvanced = ref(false)
const testing = ref(false)
const testOutput = ref('')
const testStatus = ref<'' | 'ok' | 'fail'>('')

const form = reactive({
  name: '',
  providerKind: 'openai-compatible' as ProviderKind,
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: '' as string | number,
  maxTokens: '' as string | number
})

watch(visible, (v) => {
  if (!v) return
  const src = props.editing
  form.name = src?.name ?? ''
  form.providerKind = src?.providerKind ?? 'openai-compatible'
  form.baseUrl = src?.baseUrl ?? ''
  form.apiKey = src?.apiKey ?? ''
  form.model = src?.model ?? ''
  form.temperature = src?.params.temperature ?? ''
  form.maxTokens = src?.params.maxTokens ?? ''
  testOutput.value = ''
  testStatus.value = ''
})

/** 组装 params（空串不写入；数值做范围钳制） */
function buildParams(): AiParams {
  const params: AiParams = {}
  const t = Number(form.temperature)
  const m = Number(form.maxTokens)
  if (form.temperature !== '' && !Number.isNaN(t)) params.temperature = Math.min(2, Math.max(0, t))
  if (form.maxTokens !== '' && !Number.isNaN(m)) params.maxTokens = Math.max(1, Math.round(m))
  return params
}

/** 保存（新建或更新） */
async function save(): Promise<void> {
  if (!form.name.trim() || !form.baseUrl.trim() || !form.model.trim()) {
    toast.error('名称、API 地址、模型名均不能为空')
    return
  }
  saving.value = true
  try {
    const params = buildParams()
    let res
    if (props.editing) {
      res = await window.api.apiProfiles.update(props.editing.id, {
        name: form.name,
        providerKind: form.providerKind,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        params
      })
    } else {
      const input: CreateApiProfileInput = {
        name: form.name,
        providerKind: form.providerKind,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        params
      }
      res = await window.api.apiProfiles.create(input)
    }
    if (!res.ok) throw new Error(res.error)
    toast.success(`档案「${res.data.name}」已保存`)
    visible.value = false
    emit('saved', res.data)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

/** 连通测试：用当前表单内容（无需先保存）发起一次流式请求；可随时停止 */
let testSession: { abort: () => void } | null = null

async function test(): Promise<void> {
  if (!form.baseUrl.trim() || !form.model.trim()) {
    toast.error('请先填写 API 地址与模型名')
    return
  }
  testing.value = true
  testOutput.value = ''
  testStatus.value = ''
  try {
    testSession = await chatStream(
      {
        id: '', // 临时档案：不落库直接测
        name: form.name,
        providerKind: form.providerKind,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        params: buildParams()
      },
      [{ role: 'user', content: '请用一句话介绍你自己。' }],
      {
        onChunk: (t) => {
          testOutput.value += t
        },
        onDone: (info) => {
          testStatus.value = 'ok'
          testOutput.value += `\n（首字 ${info.firstTokenMs}ms，总耗时 ${(info.totalMs / 1000).toFixed(1)}s）`
          testing.value = false
        },
        onError: (m) => {
          testStatus.value = 'fail'
          testOutput.value = testOutput.value || m
          testing.value = false
        }
      }
    )
  } catch (err) {
    testStatus.value = 'fail'
    testOutput.value = err instanceof Error ? err.message : '测试失败'
    testing.value = false
  }
}

/** 停止进行中的测试 */
function stopTest(): void {
  testSession?.abort()
  testing.value = false
}

// 弹窗关闭时中止仍在进行的测试，避免后台空跑
watch(visible, (v) => {
  if (!v) stopTest()
})

onBeforeUnmount(() => stopTest())
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      @click.self="visible = false"
    >
      <div class="flex max-h-[85vh] w-[520px] flex-col rounded-2xl bg-surface p-6 shadow-card">
        <h2 class="mb-5 text-lg font-semibold">{{ editing ? '编辑 API 档案' : '新建 API 档案' }}</h2>

        <div class="flex flex-col gap-4 overflow-y-auto pr-1">
          <div class="grid grid-cols-2 gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm text-ink-text-secondary">档案名称 *</span>
              <input
                v-model="form.name"
                type="text"
                maxlength="30"
                placeholder="如：日常速写 / 精修专用"
                class="rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm text-ink-text-secondary">协议类型</span>
              <select
                v-model="form.providerKind"
                class="rounded-lg border border-ink-border bg-surface px-3 py-2 outline-none focus:border-ink-primary"
              >
                <option value="openai-compatible">OpenAI 兼容（适用于绝大多数平台）</option>
              </select>
            </label>
          </div>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm text-ink-text-secondary">API 地址 *</span>
            <input
              v-model="form.baseUrl"
              type="text"
              placeholder="https://……（到 /v1 为止，不带末尾斜杠）"
              class="rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm text-ink-text-secondary">API Key</span>
            <input
              v-model="form.apiKey"
              type="password"
              autocomplete="off"
              placeholder="sk-…（仅保存在本机）"
              class="rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm text-ink-text-secondary">模型名称 *</span>
            <input
              v-model="form.model"
              type="text"
              placeholder="如 glm-4.7 / deepseek-v4-flash"
              class="rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary"
            />
          </label>

          <button
            class="self-start text-sm text-ink-primary hover:underline"
            @click="showAdvanced = !showAdvanced"
          >
            {{ showAdvanced ? '收起' : '展开' }}高级参数
          </button>
          <div v-if="showAdvanced" class="grid grid-cols-2 gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm text-ink-text-secondary">温度（0~2，越低越稳定）</span>
              <input
                v-model="form.temperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                placeholder="默认"
                class="rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm text-ink-text-secondary">最大生成字数</span>
              <input
                v-model="form.maxTokens"
                type="number"
                min="1"
                placeholder="默认"
                class="rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary"
              />
            </label>
          </div>

          <!-- 连通测试输出区 -->
          <div v-if="testOutput || testing" class="rounded-lg bg-paper p-3">
            <p v-if="testing" class="text-sm text-ink-text-muted">正在请求…</p>
            <p
              v-else
              class="max-h-28 overflow-y-auto whitespace-pre-wrap text-sm"
              :class="testStatus === 'ok' ? 'text-ink-success' : 'text-ink-danger'"
            >{{ testOutput }}</p>
          </div>
        </div>

        <div class="mt-6 flex justify-between">
          <button
            class="rounded-lg border px-4 py-2 text-sm transition-colors"
            :class="testing
              ? 'border-ink-danger text-ink-danger hover:brightness-110'
              : 'border-ink-border text-ink-text-secondary hover:border-ink-primary hover:text-ink-primary'"
            @click="testing ? stopTest() : test()"
          >
            {{ testing ? '停止' : '测试连接' }}
          </button>
          <div class="flex gap-3">
            <button
              class="rounded-lg px-4 py-2 text-ink-text-secondary transition-colors hover:bg-ink-primary-soft"
              @click="visible = false"
            >
              取消
            </button>
            <button
              class="rounded-lg bg-ink-primary px-5 py-2 text-white transition-colors hover:bg-ink-primary-hover disabled:opacity-50"
              :disabled="saving"
              @click="save"
            >
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>
