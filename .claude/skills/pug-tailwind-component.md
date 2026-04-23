---
name: pug-tailwind-component
description: Create Vue 3 SFC components using Pug template syntax with Tailwind CSS v4
---

When creating Vue components in this project, follow these patterns:

1. **Template syntax**: Always use `<template lang="pug">`.
2. **Styling**: Use `<style scoped lang="sass">` for component styles.
3. **Tailwind classes in Pug**: Only plain letter/digit/hyphen classes are safe as dot-prefixed pug shortcuts. Anything
   that contains a character the pug class lexer treats as a terminator/operator MUST go inside the parenthesized
   `class=""` attribute. Concretely, use `class="…"` for any token containing:
   - `/` (opacity modifier — e.g. `bg-black/60`, `text-white/70`, `border-white/10`)
   - `[` or `]` (arbitrary values — e.g. `bg-[#0f1a30]`, `max-w-[300px]`, `text-[11px]`)
   - `:` (variant prefixes — e.g. `hover:bg-red-500`, `sm:text-base`, `md:grid-cols-2`)
   - `!` (important override — e.g. `!py-1`)
   ```pug
   // ✅ Correct — breaks parse if written as `.text-white/70.text-sm`
   p.text-sm.uppercase.tracking-widest(class="text-white/70")
   // ✅ Correct — arbitrary values and variants belong in class=""
   div.flex.items-center(class="gap-2 sm:gap-4 bg-[#0f1a30] hover:bg-[#1a2b4b]")
   ```
   Rule of thumb: if the class name wouldn't be a valid CSS identifier (no slashes, brackets, colons, or bangs), leave
   it on the dot-shorthand chain. Otherwise, move it into `class="…"`.

4. **Dynamic classes**: Use `:class` with array or object syntax, escape line breaks with `\`:
   ```pug
   div(
     :class="[\
       isActive ? 'bg-yellow-500' : 'bg-slate-700',\
       'rounded-lg border-2'\
     ]"
   )
   ```
5. **Dynamic styles with safe-area**: Use `:style` with template literals:
   ```pug
   div(
     :style="{\
       bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)`,\
       left: 'calc(0.5rem + env(safe-area-inset-left, 0px))'\
     }"
   )
   ```
6. **Responsive sizing**: Always mobile-first: `text-sm sm:text-base`, `scale-80 sm:scale-100`.
7. **3D button pattern**: Shadow div underneath + gradient body:
   ```pug
   div.relative
     div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
     div.relative.rounded-lg.border-2(class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]")
   ```
8. **Game text**: Use `.game-text` class for text-shadow on game UI text.
9. **Transitions**: Use Vue `<Transition>` with Tailwind utility classes for enter/leave.
10. **Modals**: Always use `FModal` molecule with v-model, safe-area padding, and optional `#footer` slot.
