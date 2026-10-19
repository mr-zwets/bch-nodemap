<script setup lang="ts">
import { CONSENSUS_LABEL, type ConsensusStatus } from '#shared/utils/consensus'
defineProps<{ status: ConsensusStatus }>()
</script>

<template>
  <span class="sb" :class="status"><StatusIcon :status="status" />{{ CONSENSUS_LABEL[status] }}</span>
</template>

<style scoped>
.sb { display: inline-flex; align-items: center; gap: 5px; font-size: 0.82rem; white-space: nowrap; color: var(--ink-2); }
.sb.stalled { color: var(--critical-ink); font-weight: 600; }
.sb.behind { color: var(--warning-ink); }
</style>
