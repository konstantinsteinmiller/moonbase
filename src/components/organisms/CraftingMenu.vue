<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
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
    // Finished a charge: mint one bar, then either queue the next piece of
    // ore (consuming it up front so the stats display reflects the charge
    // currently in the furnace) or stop because the hopper is empty.
    addMetal(1)
    smeltProgress.value = 0
    if (ore.value <= 0 || !consumeOre(1)) {
      isSmelting.value = false
      if (phase.value !== 'complete') {
        setPhase('complete')
        showMissionBanner('Mission complete — statue-grade metal ready.', 6000)
        // Fire the completion dialog. MoonScene's isDialogOpen watcher
        // flips `complete → explorer_walk` only when a dialog *closes*,
        // so without this the phase sticks on `complete` and the HUD
        // marker never re-targets to the next objective.
        startDialog('mission_complete')
      }
      return
    }
  }
  raf = requestAnimationFrame(tickSmelt)
}

const startSmelt = () => {
  if (isSmelting.value) return
  // Charge the furnace with the first piece of ore. Subsequent pieces are
  // consumed by tickSmelt as each bar finishes, so a full hopper melts
  // down in one press instead of one-per-click.
  if (!consumeOre(1)) return
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

// Escape / C toggling is owned by MoonScene's window listener — having a
// second listener here would fight it: MoonScene opens on C, then this
// listener saw `modelValue=true` on the SAME keydown and closed again,
// so the menu never visibly opened.
onUnmounted(() => cancelAnimationFrame(raf))

const progressPct = computed(() => smeltProgress.value * 100)
</script>

<template lang="pug">
  Transition(name="craft-fade")
    //- NOT a modal — no backdrop click-out, no teleport. Canvas overlay only.
    div.crafting-menu(
      v-if="modelValue"
      class="fixed right-6 top-24 bottom-24 z-40 w-[380px] max-w-[85vw] rounded-3xl border-4 border-[#0f1a30] bg-[#1a2b4b]/95 shadow-2xl backdrop-blur-sm flex flex-col"
    )
      div.header(
        class="shrink-0 rounded-t-[1.2rem] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] px-4 py-3 flex items-center justify-between border-b-4 border-[#0f1a30]"
      )
        div.title.text-lg.font-black.uppercase.tracking-wider.text-white.brawl-text Smelter
        FIconButton(icon="close" type="danger" size="sm" @click="close")

      //- Body is a min-height-0 flex column so the middle (smelter viz)
      //- shrinks and scrolls rather than pushing the action buttons off the
      //- bottom edge when all three command buttons are visible.
      div.body(class="flex-1 min-h-0 p-4 flex flex-col gap-3 text-white overflow-y-auto")
        p.text-sm.leading-relaxed.shrink-0(class="text-white/70")
          | Feed ore to the furnace. Each charge burns for about three seconds and drops one metal bar. The hopper keeps feeding until it runs dry — the world keeps moving while it does, so watch your flanks.
        div.stats.grid.grid-cols-2.gap-3.shrink-0
          div.stat(class="rounded-lg bg-black/30 border border-white/10 px-3 py-2")
            div(class="text-[10px] uppercase tracking-widest text-white/50") Ore
            div(class="text-2xl font-black text-[#ffcd00]") {{ ore }}
          div.stat(class="rounded-lg bg-black/30 border border-white/10 px-3 py-2")
            div(class="text-[10px] uppercase tracking-widest text-white/50") Metal
            div.text-2xl.font-black.text-emerald-300 {{ metal }}

        div.smelter(
          class="relative h-28 shrink-0 rounded-xl border-2 border-[#0f1a30] bg-gradient-to-b from-[#2a1810] to-[#0d0604] overflow-hidden flex flex-col justify-end"
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

        //- Action block is a flex-col and a shrink-0 guard so it never gets
        //- pushed off the bottom of the panel. Buttons are tappable even on
        //- narrow panes because each row is its own flex item.
        div.actions(class="shrink-0 flex flex-col gap-2 mt-auto")
          button.primary-action(
            type="button"
            :disabled="!canCraft || ore < 1 || isSmelting"
            class="w-full rounded-xl border-2 border-[#0f1a30] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] px-4 py-3 text-center font-black uppercase tracking-wider text-white brawl-text transition-transform hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
            @click="startSmelt"
          )
            template(v-if="isSmelting") Smelting…
            template(v-else-if="ore > 0") Smelt {{ ore }} Ore
            template(v-else) Out of Ore

          //- Post-meteor repair options — only surfaced while the matching
          //- module is actually broken, so the menu stays clean pre-strike.
          button.repair-action(
            v-if="isSolarCellBroken"
            type="button"
            :disabled="!canRepairSolar"
            class="w-full rounded-xl border-2 border-[#0f1a30] bg-gradient-to-b from-[#50aaff] to-[#2266ff] px-3 py-2 text-left transition-transform hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
            @click="repairSolar"
          )
            div.font-black.uppercase.tracking-wider.text-white.text-sm.brawl-text Repair Solar Cell
            div(class="text-[11px] uppercase tracking-widest text-white/80") {{ SOLAR_METAL_COST }} Metal · {{ SOLAR_PARTS_COST }} Salvage
          button.repair-action(
            v-if="isCommsBroken"
            type="button"
            :disabled="!canRepairComms"
            class="w-full rounded-xl border-2 border-[#0f1a30] bg-gradient-to-b from-[#50aaff] to-[#2266ff] px-3 py-2 text-left transition-transform hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
            @click="repairCommsAction"
          )
            div.font-black.uppercase.tracking-wider.text-white.text-sm.brawl-text Repair Comms
            div(class="text-[11px] uppercase tracking-widest text-white/80") {{ COMMS_METAL_COST }} Metal · {{ COMMS_PARTS_COST }} Salvage

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
