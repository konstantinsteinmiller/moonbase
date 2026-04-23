<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import FButton from '@/components/atoms/FButton.vue'
import FIconButton from '@/components/atoms/FIconButton.vue'
import useInventory from '@/use/useInventory'
import useMission from '@/use/useMission'

/**
 * Non-pausing crafting overlay.
 *
 * Opened with C (when the player is inside the base). The rest of the scene
 * keeps running behind a translucent backdrop — per spec, the world must NOT
 * pause while the robot fiddles with the smelter.
 */

const props = defineProps<{ modelValue: boolean; canCraft: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const {
  ore, metal, parts,
  consumeOre, addMetal, consumeMetal, consumeParts,
  isSolarCellBroken, isCommsBroken,
  repairSolarCell, repairComms
} = useInventory()
const { setPhase, setPhaseUnsafe, showMissionBanner, phase, startDialog } = useMission()

const smeltProgress = ref(0)        // 0..1
const isSmelting = ref(false)
const SMELT_DURATION = 3.4          // seconds per ingot

let raf = 0
let last = 0

const tickSmelt = (now: number) => {
  if (!isSmelting.value) return
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  smeltProgress.value += dt / SMELT_DURATION
  if (smeltProgress.value >= 1) {
    smeltProgress.value = 0
    addMetal(1)
    if (ore.value <= 0) {
      isSmelting.value = false
      if (phase.value !== 'complete') {
        setPhase('complete')
        showMissionBanner('Mission complete — statue-grade metal ready.', 6000)
      }
      return
    }
  }
  raf = requestAnimationFrame(tickSmelt)
}

const startSmelt = () => {
  if (!consumeOre(1)) return
  if (isSmelting.value) return
  isSmelting.value = true
  last = performance.now()
  smeltProgress.value = 0
  raf = requestAnimationFrame(tickSmelt)
}

const close = () => {
  isSmelting.value = false
  cancelAnimationFrame(raf)
  emit('update:modelValue', false)
}

/** Repair costs. Pulled out so the button label + the actual debit stay
 *  in sync without a bug-prone second constant. */
const SOLAR_METAL_COST = 1
const SOLAR_PARTS_COST = 2
const COMMS_METAL_COST = 1
const COMMS_PARTS_COST = 1

const canRepairSolar = computed(() =>
  props.canCraft
  && isSolarCellBroken.value
  && metal.value >= SOLAR_METAL_COST
  && parts.value >= SOLAR_PARTS_COST
)

const canRepairComms = computed(() =>
  props.canCraft
  // Comms can only be re-seated after the solar cell is back — Ewall won't
  // risk powering an antenna with no reserve.
  && !isSolarCellBroken.value
  && isCommsBroken.value
  && metal.value >= COMMS_METAL_COST
  && parts.value >= COMMS_PARTS_COST
)

const repairSolar = () => {
  if (!canRepairSolar.value) return
  consumeMetal(SOLAR_METAL_COST)
  consumeParts(SOLAR_PARTS_COST)
  repairSolarCell()
  showMissionBanner('Solar cell reseated. Energy restored.', 4500)
  // Kick the phase watcher in MoonScene: solar repaired → Ewall-9 arrives.
  setPhaseUnsafe('ewall9_meeting')
  startDialog('mission_solar_repaired')
  close()
}

const repairCommsAction = () => {
  if (!canRepairComms.value) return
  consumeMetal(COMMS_METAL_COST)
  consumeParts(COMMS_PARTS_COST)
  repairComms()
  showMissionBanner('Comms online — transmission resumed.', 4500)
  setPhaseUnsafe('ending_comms_repaired')
  startDialog('mission_ending_repair')
  close()
}

const handleKey = (e: KeyboardEvent) => {
  if (!props.modelValue) return
  if (e.code === 'Escape' || e.code === 'KeyC') {
    e.preventDefault()
    close()
  }
}

onMounted(() => window.addEventListener('keydown', handleKey))
onUnmounted(() => {
  window.removeEventListener('keydown', handleKey)
  cancelAnimationFrame(raf)
})

const progressPct = computed(() => smeltProgress.value * 100)
</script>

<template lang="pug">
  Transition(name="craft-fade")
    //- NOT a modal — no backdrop click-out, no teleport. Canvas overlay only.
    div.crafting-menu(
      v-if="modelValue"
      class="fixed right-6 top-24 bottom-24 z-40 w-[360px] max-w-[80vw] rounded-3xl border-4 border-[#0f1a30] bg-[#1a2b4b]/95 shadow-2xl backdrop-blur-sm flex flex-col"
    )
      div.header(
        class="rounded-t-[1.2rem] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] px-4 py-3 flex items-center justify-between border-b-4 border-[#0f1a30]"
      )
        div.title.text-lg.font-black.uppercase.tracking-wider.text-white.brawl-text Smelter
        FIconButton(icon="close" type="danger" size="sm" @click="close")

      div.body.flex-1.p-4.flex.flex-col.gap-4.text-white
        p.text-sm.leading-relaxed(class="text-white/70")
          | Feed iron ore to the furnace. Each charge melts into one metal ingot in about three seconds. The world keeps moving — drain your attention wisely.
        div.stats.grid.grid-cols-2.gap-3
          div.stat(class="rounded-lg bg-black/30 border border-white/10 px-3 py-2")
            div(class="text-[10px] uppercase tracking-widest text-white/50") Ore
            div(class="text-2xl font-black text-[#ffcd00]") {{ ore }}
          div.stat(class="rounded-lg bg-black/30 border border-white/10 px-3 py-2")
            div(class="text-[10px] uppercase tracking-widest text-white/50") Metal
            div.text-2xl.font-black.text-emerald-300 {{ metal }}

        div.smelter(
          class="relative flex-1 min-h-32 rounded-xl border-2 border-[#0f1a30] bg-gradient-to-b from-[#2a1810] to-[#0d0604] overflow-hidden flex flex-col justify-end"
        )
          //- Flame visualization.
          div.flames(
            v-if="isSmelting"
            class="absolute inset-0 bg-gradient-to-t from-[#ff5a1a] via-[#ffcd00]/60 to-transparent animate-pulse"
          )
          div.progress-track(
            class="relative m-2 h-3 rounded-full bg-black/60 border border-white/10 overflow-hidden"
          )
            div(
              class="h-full bg-gradient-to-r from-[#ff5a1a] to-[#ffcd00] transition-[width] duration-100"
              :style="{ width: `${progressPct}%` }"
            )
          div.label.absolute.inset-0.flex.items-center.justify-center.text-sm.font-bold.tracking-widest.uppercase
            template(v-if="isSmelting") Smelting… {{ Math.round(progressPct) }}%
            template(v-else-if="ore <= 0") Out of ore
            template(v-else) Furnace cold

        div.actions.flex.flex-col.gap-2
          FButton(
            type="primary"
            :is-disabled="!canCraft || ore < 1 || isSmelting"
            @click="startSmelt"
          )
            | Smelt 1 Ore
          //- Post-meteor repair options — only surfaced while the matching
          //- module is actually broken, so the menu stays clean pre-strike.
          FButton(
            v-if="isSolarCellBroken"
            type="secondary"
            :is-disabled="!canRepairSolar"
            @click="repairSolar"
          )
            | Repair Solar Cell ({{ SOLAR_METAL_COST }} Metal · {{ SOLAR_PARTS_COST }} Salvage)
          FButton(
            v-if="isCommsBroken"
            type="secondary"
            :is-disabled="!canRepairComms"
            @click="repairCommsAction"
          )
            | Repair Comms ({{ COMMS_METAL_COST }} Metal · {{ COMMS_PARTS_COST }} Salvage)
          div.hint.text-center.text-xs(class="text-white/50") Press C to close
</template>

<style scoped lang="sass">
.craft-fade-enter-active, .craft-fade-leave-active
  transition: opacity 200ms ease, transform 200ms ease

.craft-fade-enter-from, .craft-fade-leave-to
  opacity: 0
  transform: translateX(24px)

.brawl-text
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000
</style>
