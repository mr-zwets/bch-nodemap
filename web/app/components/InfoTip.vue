<script setup lang="ts">
/** Small "i" button that reveals a short explanation on hover, focus or tap. */
defineProps<{ text: string; label?: string; align?: 'left' | 'right' }>()
const id = useId()
</script>

<template>
  <span class="it" :class="align ?? 'right'">
    <button type="button" class="ib" :aria-label="label ?? 'More info'" :aria-describedby="id">
      <slot>i</slot>
    </button>
    <span :id="id" role="tooltip" class="bubble">{{ text }}</span>
  </span>
</template>

<style scoped>
.it { position: relative; display: inline-flex; vertical-align: middle; margin-left: 6px; }
.ib {
  width: 15px; height: 15px; padding: 0; border-radius: 50%; border: 1px solid var(--rule-strong);
  background: none; color: var(--ink-3); font: italic 600 10px/13px Georgia, serif; cursor: help;
}
.ib:hover, .ib:focus-visible { color: var(--ink); border-color: var(--ink-3); }
.bubble {
  position: absolute; top: calc(100% + 6px); z-index: 5; width: max-content; max-width: 260px;
  padding: 7px 9px; border-radius: 6px; background: var(--ink); color: var(--surface);
  font-size: 0.78rem; font-weight: 400; line-height: 1.4; text-align: left; white-space: normal;
  opacity: 0; visibility: hidden; transition: opacity 0.12s; pointer-events: none;
}
.right .bubble { right: -4px; }
.left .bubble { left: -4px; }
.it:hover .bubble, .ib:focus + .bubble { opacity: 1; visibility: visible; }
</style>
