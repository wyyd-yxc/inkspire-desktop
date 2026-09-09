<script setup lang="ts">
/**
 * 风格包编辑弹窗（新建/编辑复用，参照 ApiProfileDialog 模式）：
 * 名称/文笔调性/叙事规则条目（动态行增删）/单章字数软目标区间/样例片段。
 */
import { reactive, ref, watch } from 'vue'
import type { CreateStyleProfileInput, StyleProfile } from '../../../../shared/style.types'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ editing?: StyleProfile | null }>()
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [profile: StyleProfile] }>()

const toast = useToast()
const saving = ref(false)
/** 叙事规则用可编辑行（空行保存时过滤，编辑期保留便于续写） */
const form = reactive({
  name: '',
  tone: '',
  rules: [''] as string[],
  targetMin: '' as string | number,
  targetMax: '' as string | number,
  sample: ''
})

watch(visible, (v) => {
  if (!v) return
  const src = props.editing
  form.name = src?.name ?? ''
  form.tone = src?.tone ?? ''
  form.rules = src?.rules.length ? [...src.rules] : ['']
  form.targetMin = src?.wordTargetMin ?? ''
  form.targetMax = src?.wordTargetMax ?? ''
  form.sample = src?.sample ?? ''
})

function addRule(): void {
  form.rules.push('')
}
function removeRule(i: number): void {
  form.rules.splice(i, 1)
}

/** 字数输入解析：空串→null（不约束）；非法/非正→null */
function parseTarget(v: string | number): number | null {
  const n = Number(v)
  return v !== '' && !Number.isNaN(n) && n > 0 ? Math.round(n) : null
}

async function save(): Promise<void> {
  if (!form.name.trim()) {
    toast.error('风格包名称不能为空')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name,
      tone: form.tone,
      rules: form.rules.map((r) => r.trim()).filter(Boolean),
      wordTargetMin: parseTarget(form.targetMin),
      wordTargetMax: parseTarget(form.targetMax),
      sample: form.sample
    }
    const res = props.editing
      ? await window.api.styles.update(props.editing.id, payload)
      : await window.api.styles.create(payload as CreateStyleProfileInput)
    if (!res.ok) throw new Error(res.error)
    toast.success(`风格包「${res.data.name}」已保存`)
    visible.value = false
    emit('saved', res.data)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
      @click.self="visible = false"
    >
      <div class="flex max-h-[85vh] w-[540px] flex-col rounded-2xl bg-surface shadow-card">
        <div class="flex items-center justify-between border-b border-ink-border/60 px-6 py-4">
          <h2 class="text-base font-semibold">{{ editing ? '编辑风格包' : '新建风格包' }}</h2>
          <button class="text-ink-text-muted hover:text-ink-text" @click="visible = false">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div class="flex flex-col gap-4 text-sm">
            <label class="flex flex-col gap-1">
              <span class="text-ink-text-secondary">包名 *</span>
              <input
                v-model="form.name"
                maxlength="30"
                placeholder="如：冷峻暗调"
                class="rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-ink-text-secondary">文笔调性（一句话总约束）</span>
              <input
                v-model="form.tone"
                maxlength="120"
                placeholder="如：冷峻克制，多用白描，少用感叹号"
                class="rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary"
              />
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-ink-text-secondary">叙事规则（逐条约束人称/时态/视角等）</span>
              <div class="flex flex-col gap-1.5">
                <div v-for="(_, i) in form.rules" :key="i" class="flex items-center gap-1.5">
                  <input
                    v-model="form.rules[i]"
                    maxlength="100"
                    placeholder="如：全文第三人称过去式"
                    class="min-w-0 flex-1 rounded-lg border border-ink-border px-3 py-1.5 text-xs outline-none focus:border-ink-primary"
                  />
                  <button
                    class="shrink-0 text-xs text-ink-text-muted hover:text-ink-danger"
                    title="删除该条"
                    @click="removeRule(i)"
                  >✕</button>
                </div>
              </div>
              <button class="self-start text-xs text-ink-primary hover:underline" @click="addRule">+ 加一条</button>
            </div>
            <div class="flex items-center gap-2">
              <span class="shrink-0 text-ink-text-secondary">单章字数目标</span>
              <input
                v-model="form.targetMin"
                type="number"
                min="0"
                placeholder="下限"
                class="w-24 rounded-lg border border-ink-border px-2 py-1.5 text-xs outline-none focus:border-ink-primary"
              />
              <span class="text-ink-text-muted">—</span>
              <input
                v-model="form.targetMax"
                type="number"
                min="0"
                placeholder="上限"
                class="w-24 rounded-lg border border-ink-border px-2 py-1.5 text-xs outline-none focus:border-ink-primary"
              />
              <span class="text-xs text-ink-text-muted">留空不约束（软目标）</span>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-ink-text-secondary">文风样例（展示用，不注入 AI）</span>
              <textarea
                v-model="form.sample"
                rows="3"
                placeholder="贴一段能代表这个文风的句子"
                class="resize-y rounded-lg border border-ink-border px-3 py-2 outline-none focus:border-ink-primary"
              />
            </label>
          </div>
        </div>
        <div class="flex justify-end gap-3 border-t border-ink-border/60 px-6 py-4">
          <button
            class="rounded-lg px-4 py-2 text-sm text-ink-text-secondary transition-colors hover:bg-ink-primary-soft"
            @click="visible = false"
          >取消</button>
          <button
            class="rounded-lg bg-ink-primary px-4 py-2 text-sm text-white transition-colors hover:bg-ink-primary-hover disabled:opacity-40"
            :disabled="saving"
            @click="save"
          >{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
