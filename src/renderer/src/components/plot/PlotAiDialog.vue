<script setup lang="ts">
/**
 * AI 生成配置弹窗：三模式共用（补充指令；分歧模式额外配置方向数与各方向简述，可留空）。
 * 照原站交互：方向简述留空由 AI 自由发挥；提交时 emit start 带全部配置。
 */
import { ref, watch } from 'vue'
import type { PlotGenMode } from '../../../../shared/plot.types'

interface Props {
  visible: boolean
  mode: PlotGenMode
  modeLabel: string
  hint: string
  busy: boolean
  /** 联动信息行（如「已联动：3 章进度 · 5 条记忆 · 2 条常驻设定」） */
  contextInfo: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  start: [payload: { instruction: string; divergeCount: number; divergeHints: string[] }]
  close: []
}>()

const instruction = ref('')
const divergeCount = ref(3)
const divergeHints = ref<string[]>(['', '', '', ''])

// 打开时重置输入（instruction 等先于 watch 声明，踩坑 #18）
watch(
  () => props.visible,
  (v) => {
    if (v) {
      instruction.value = ''
      divergeCount.value = 3
      divergeHints.value = ['', '', '', '']
    }
  }
)

function start(): void {
  emit('start', {
    instruction: instruction.value.trim(),
    divergeCount: divergeCount.value,
    divergeHints: [...divergeHints.value]
  })
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      @click.self="emit('close')"
    >
      <div class="w-[480px] rounded-2xl bg-surface p-5 shadow-2xl">
        <h2 class="font-semibold text-ink-primary">{{ modeLabel }}</h2>
        <p class="mt-1 text-xs text-ink-text-muted">{{ hint }}</p>
        <p v-if="contextInfo" class="mt-1 text-[11px] text-ink-success">✓ {{ contextInfo }}</p>
        <textarea
          v-model="instruction"
          rows="3"
          placeholder="补充指令（可留空）：如「突出女主视角」「节奏再快一些」"
          class="mt-3 w-full resize-y rounded-lg border border-ink-border px-3 py-2 text-sm outline-none focus:border-ink-primary"
        />
        <div v-if="mode === 'diverge'" class="mt-3">
          <div class="flex items-center gap-2 text-sm text-ink-text-secondary">
            分歧方向数
            <select
              v-model.number="divergeCount"
              class="rounded border border-ink-border bg-surface px-1.5 py-0.5 text-xs outline-none"
            >
              <option :value="2">2</option>
              <option :value="3">3</option>
              <option :value="4">4</option>
            </select>
            <span class="text-xs text-ink-text-muted">各方向可填简短描述，留空由 AI 自由发挥</span>
          </div>
          <input
            v-for="i in divergeCount"
            :key="i"
            v-model="divergeHints[i - 1]"
            :placeholder="`方向${i}简述（可选）：如「拒绝师门、独自下山」`"
            maxlength="60"
            class="mt-1.5 w-full rounded-lg border border-ink-border px-3 py-1.5 text-xs outline-none focus:border-ink-primary"
          />
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg border border-ink-border px-3 py-1.5 text-xs text-ink-text-secondary hover:text-ink-text"
            @click="emit('close')"
          >取消</button>
          <button
            class="rounded-lg bg-ink-primary px-4 py-1.5 text-xs text-white shadow-card transition-colors hover:bg-ink-primary-hover disabled:opacity-50"
            :disabled="busy"
            @click="start"
          >{{ busy ? '生成中…' : '开始生成' }}</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
