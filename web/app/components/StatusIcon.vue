<script setup lang="ts">
import type { ConsensusStatus } from '#shared/utils/consensus'
defineProps<{ status: ConsensusStatus; size?: number }>()
</script>

<!-- Shapes live once in <StatusSprite> (app.vue); every icon is a cheap <use>. -->
<template>
  <svg :width="size ?? 12" :height="size ?? 12" viewBox="0 0 12 12" aria-hidden="true" class="si"><use :href="`#si-${status}`" /></svg>
</template>

<style scoped>
.si { flex: none; vertical-align: -1px; }
</style>
