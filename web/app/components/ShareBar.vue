<script setup lang="ts">
/** Part-to-whole as one thin segmented bar; segments separated by a 2px surface gap. */
const props = defineProps<{
  items: Array<{ key: string; label?: string; count: number; color: string }>
  height?: number
  label?: string
}>()
const total = computed(() => props.items.reduce((s, i) => s + i.count, 0))
</script>

<template>
  <div class="bar" :style="{ height: `${height ?? 14}px` }" role="img" :aria-label="label ?? items.map((i) => `${i.label ?? i.key} ${i.count}`).join(', ')">
    <span
      v-for="i in items.filter((x) => x.count > 0)"
      :key="i.key"
      :style="{ flexGrow: i.count, background: i.color }"
      :title="`${i.label ?? i.key}: ${i.count} (${fmtPct(i.count, total)})`"
    />
  </div>
</template>

<style scoped>
.bar { display: flex; gap: 2px; width: 100%; border-radius: 4px; overflow: hidden; background: var(--surface); }
.bar span { flex-basis: 0; min-width: 3px; }
</style>
