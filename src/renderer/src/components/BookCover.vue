<script setup lang="ts">
/**
 * 书籍封面（M17 纸墨 2.0）：题材驱动的墨系模板。
 * 结构 = 渐变底 + 题材底纹（SVG pattern）+ 书名排版（竖排/两行/三行）+ 笺纸边框角饰。
 * 纯函数配置来自 shared/coverArt.ts（确定性稳定）；有自定义封面图时由父层优先渲染图片。
 */
import { computed } from 'vue'
import { coverStyleFor, type CoverPalette } from '../../../shared/coverArt'

const props = defineProps<{
  title: string
  genre: string
}>()

const art = computed(() => coverStyleFor({ title: props.title, genre: props.genre }))

/** 书名按排版策略切分 */
const titleLines = computed((): string[] => {
  const chars = [...props.title.trim()]
  if (art.value.layout === 'vertical') return chars
  const n = chars.length
  if (art.value.layout === 'two-line') {
    const cut = Math.ceil(n / 2)
    return [chars.slice(0, cut).join(''), chars.slice(cut).join('')]
  }
  const per = Math.ceil(n / 3)
  return [chars.slice(0, per).join(''), chars.slice(per, per * 2).join(''), chars.slice(per * 2).join('')]
})

const uid = computed(() => `cv-${Math.abs([...props.title].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) % 99991)}`)
const pattern = computed(() => art.value.pattern)
const phase = computed(() => art.value.phase)
</script>

<template>
  <div class="relative h-full w-full overflow-hidden" data-cover-root>
    <svg class="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 220 160" aria-hidden="true">
      <defs>
        <linearGradient :id="`${uid}-bg`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" :stop-color="art.from" />
          <stop offset="100%" :stop-color="art.to" />
        </linearGradient>

        <!-- 题材底纹（低对比，不抢书名） -->
        <pattern v-if="pattern === 'rule-lines'" :id="`${uid}-p`" width="220" height="14" patternUnits="userSpaceOnUse" :patternTransform="`translate(0 ${phase % 14})`">
          <line x1="0" y1="13" x2="220" y2="13" :stroke="art.text" stroke-opacity="0.07" stroke-width="1" />
        </pattern>
        <pattern v-else-if="pattern === 'grid'" :id="`${uid}-p`" width="18" height="18" patternUnits="userSpaceOnUse" :patternTransform="`translate(${phase % 18} ${phase % 18})`">
          <path d="M18 0H0V18" fill="none" :stroke="art.text" stroke-opacity="0.07" stroke-width="1" />
        </pattern>
        <pattern v-else-if="pattern === 'star-arc'" :id="`${uid}-p`" width="220" height="160" patternUnits="userSpaceOnUse">
          <g fill="none" :stroke="art.text" stroke-opacity="0.12" stroke-width="1">
            <circle cx="170" cy="130" r="40" />
            <circle cx="170" cy="130" r="68" />
            <circle cx="170" cy="130" r="96" />
          </g>
          <g :fill="art.text" fill-opacity="0.5">
            <circle cx="36" cy="30" r="1.4" /><circle cx="80" cy="52" r="1" /><circle cx="130" cy="24" r="1.2" />
            <circle cx="56" cy="96" r="1" /><circle cx="104" cy="126" r="1.3" /><circle cx="188" cy="44" r="1" />
          </g>
        </pattern>
        <pattern v-else-if="pattern === 'cloud'" :id="`${uid}-p`" width="60" height="30" patternUnits="userSpaceOnUse" :patternTransform="`translate(${phase % 60} 0)`">
          <path d="M6 24 q6 -10 14 -6 q4 -8 12 -4 q8 -4 12 4 q8 0 10 6" fill="none" :stroke="art.text" stroke-opacity="0.1" stroke-width="1.2" />
        </pattern>
        <pattern v-else-if="pattern === 'rain'" :id="`${uid}-p`" width="16" height="26" patternUnits="userSpaceOnUse" :patternTransform="`translate(${phase % 16} 0)`">
          <line x1="2" y1="0" x2="-4" y2="26" :stroke="art.text" stroke-opacity="0.1" stroke-width="1" />
          <line x1="12" y1="0" x2="6" y2="26" :stroke="art.text" stroke-opacity="0.07" stroke-width="1" />
        </pattern>
        <pattern v-else-if="pattern === 'mountains'" :id="`${uid}-p`" width="220" height="160" patternUnits="userSpaceOnUse">
          <g fill="none" :stroke="art.text" stroke-opacity="0.13" stroke-width="1.3">
            <path d="M-10 130 L40 78 L74 112 L118 60 L162 108 L200 76 L240 122" />
            <path d="M-10 148 L52 100 L96 134 L142 92 L188 126 L240 100" stroke-opacity="0.08" />
          </g>
        </pattern>
        <pattern v-else-if="pattern === 'blade'" :id="`${uid}-p`" width="70" height="70" patternUnits="userSpaceOnUse" :patternTransform="`translate(${phase % 70} 0)`">
          <path d="M4 66 L60 10" :stroke="art.text" stroke-opacity="0.12" stroke-width="2" stroke-linecap="round" />
          <path d="M18 68 L66 20" :stroke="art.text" stroke-opacity="0.06" stroke-width="1.2" stroke-linecap="round" />
        </pattern>
        <pattern v-else-if="pattern === 'dots'" :id="`${uid}-p`" width="24" height="24" patternUnits="userSpaceOnUse" :patternTransform="`translate(${phase % 24} ${phase % 24})`">
          <circle cx="4" cy="4" r="1.2" :fill="art.text" fill-opacity="0.12" />
        </pattern>
        <!-- plain：无底纹 -->
      </defs>

      <rect width="220" height="160" :fill="`url(#${uid}-bg)`" />
      <rect v-if="pattern !== 'plain'" width="220" height="160" :fill="`url(#${uid}-p)`" />

      <!-- 笺纸细边框（内缩，纸感） -->
      <rect x="7" y="7" width="206" height="146" fill="none" :stroke="art.text" stroke-opacity="0.16" stroke-width="1" />
      <!-- 角饰：左上/右下双角短线 -->
      <g :stroke="art.accent" stroke-opacity="0.85" stroke-width="1.6" stroke-linecap="round">
        <path d="M13 20 V13 H20" />
        <path d="M207 140 V147 H200" />
      </g>
    </svg>

    <!-- 书名排版 -->
    <div
      v-if="art.layout === 'vertical'"
      class="absolute inset-0 flex flex-col items-center justify-center gap-1 py-6"
    >
      <span
        v-for="(ch, i) in titleLines"
        :key="i"
        class="font-serif leading-none"
        :style="{ color: art.text, fontSize: '26px', textShadow: '0 1px 2px rgb(0 0 0 / 0.18)' }"
      >{{ ch }}</span>
    </div>
    <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-8">
      <span
        v-for="(line, i) in titleLines"
        :key="i"
        class="font-serif leading-tight"
        :style="{
          color: art.text,
          fontSize: art.layout === 'two-line' ? '19px' : '15px',
          letterSpacing: '0.06em',
          textShadow: '0 1px 2px rgb(0 0 0 / 0.18)'
        }"
      >{{ line }}</span>
    </div>
  </div>
</template>