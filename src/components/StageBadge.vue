<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ArenaType } from '@/use/useSpinnerCampaign'

const { t } = useI18n()

interface Props {
  stageId: number
  name: string
  cycleSuffix?: string
  isBoss?: boolean
  arenaType?: ArenaType
}

const props = withDefaults(defineProps<Props>(), {
  cycleSuffix: '',
  isBoss: false,
  arenaType: 'default'
})

const displayName = computed(() => {
  const translated = t(`stages.${props.name}`, props.name)
  return props.cycleSuffix ? `${translated} ${props.cycleSuffix}` : translated
})

// Per-arena gradient + accent palette. Boss stages always use the red palette
// regardless of arenaType.
interface StageTheme {
  from: string
  to: string
  border: string
  shadowBase: string
  number: string
  numberShadow: string
  accent: string
  glow: string
}

const stageTheme = computed<StageTheme>(() => {
  if (props.isBoss) {
    return {
      from: 'from-red-600',
      to: 'to-red-900',
      border: 'border-red-300',
      shadowBase: 'bg-red-950',
      number: 'text-red-100',
      numberShadow: 'bg-red-950/70',
      accent: 'text-red-200',
      glow: 'shadow-red-500/60'
    }
  }
  switch (props.arenaType) {
    case 'lava':
      return {
        from: 'from-orange-500',
        to: 'to-orange-800',
        border: 'border-orange-300',
        shadowBase: 'bg-orange-950',
        number: 'text-orange-100',
        numberShadow: 'bg-orange-950/70',
        accent: 'text-orange-200',
        glow: 'shadow-orange-500/60'
      }
    case 'ice':
      return {
        from: 'from-cyan-400',
        to: 'to-cyan-800',
        border: 'border-cyan-200',
        shadowBase: 'bg-cyan-950',
        number: 'text-cyan-50',
        numberShadow: 'bg-cyan-950/70',
        accent: 'text-cyan-100',
        glow: 'shadow-cyan-400/60'
      }
    case 'forest':
      return {
        from: 'from-green-500',
        to: 'to-green-800',
        border: 'border-green-300',
        shadowBase: 'bg-green-950',
        number: 'text-green-100',
        numberShadow: 'bg-green-950/70',
        accent: 'text-green-200',
        glow: 'shadow-green-500/60'
      }
    case 'thunder':
      return {
        from: 'from-yellow-400',
        to: 'to-yellow-700',
        border: 'border-yellow-200',
        shadowBase: 'bg-yellow-950',
        number: 'text-yellow-50',
        numberShadow: 'bg-yellow-950/70',
        accent: 'text-yellow-100',
        glow: 'shadow-yellow-400/60'
      }
    case 'shock':
      return {
        from: 'from-fuchsia-500',
        to: 'to-fuchsia-900',
        border: 'border-fuchsia-300',
        shadowBase: 'bg-fuchsia-950',
        number: 'text-fuchsia-100',
        numberShadow: 'bg-fuchsia-950/70',
        accent: 'text-fuchsia-200',
        glow: 'shadow-fuchsia-500/60'
      }
    default:
      return {
        from: 'from-slate-500',
        to: 'to-slate-800',
        border: 'border-slate-300',
        shadowBase: 'bg-slate-950',
        number: 'text-slate-50',
        numberShadow: 'bg-slate-950/70',
        accent: 'text-slate-200',
        glow: 'shadow-slate-500/50'
      }
  }
})
</script>

<template lang="pug">
  div.stage-badge.relative
    //- 3D drop-shadow base, tinted to the arena palette
    div.absolute.inset-0.translate-y-1.rounded-xl.opacity-80(:class="stageTheme.shadowBase")
    //- Body
    div.relative.flex.items-center.gap-2.rounded-xl.border-2.shadow-lg.overflow-hidden(
      :class="['bg-gradient-to-b', stageTheme.from, stageTheme.to, stageTheme.border, stageTheme.glow]"
      class="pl-1.5 pr-3 py-1"
    )
      //- Stage number chip
      div.relative.flex.items-center.justify-center.rounded-lg.border(
        :class="[stageTheme.numberShadow, stageTheme.border]"
        class="min-w-7 h-7 sm:min-w-8 sm:h-8 px-1"
      )
        span.font-black.game-text.leading-none(
          :class="stageTheme.number"
          class="text-sm sm:text-base"
        ) {{ isBoss ? `💀${stageId}` : stageId }}
      //- Label + name stack
      div.flex.flex-col.leading-tight
        span.font-black.uppercase.tracking-wider.game-text.text-white(
          class="text-[9px] sm:text-[11px] opacity-90"
        ) {{ isBoss ? t('bossStage') : t('stage') + ' ' + stageId }}
        span.font-bold.italic.game-text(
          :class="stageTheme.accent"
          class="text-[10px] sm:text-xs"
        ) {{ displayName }}
</template>
