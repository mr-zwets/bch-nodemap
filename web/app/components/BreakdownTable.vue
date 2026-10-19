<script setup lang="ts" generic="T extends { key: string; count: number }">
/** The classic cashnodes table: label, node count, share, with a recessive inline bar. */
const props = defineProps<{
  rows: T[]
  total: number
  heading: string
  limit?: number
}>()
const expanded = ref(false)
const limit = computed(() => props.limit ?? 15)
const shown = computed(() => (expanded.value ? props.rows : props.rows.slice(0, limit.value)))
const max = computed(() => Math.max(1, ...props.rows.map((r) => r.count)))
</script>

<template>
  <div>
    <div class="table-scroll">
      <table class="data">
        <thead>
          <tr>
            <th class="rank r">Rank</th>
            <th>{{ heading }}</th>
            <th class="r">Nodes</th>
            <th class="r">Share</th>
            <th class="barcol" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in shown" :key="r.key">
            <td class="rank r muted">{{ i + 1 }}</td>
            <td class="label"><slot name="label" :row="r">{{ r.key }}</slot></td>
            <td class="r">{{ fmtInt(r.count) }}</td>
            <td class="r muted">{{ fmtPct(r.count, total) }}</td>
            <td class="barcol" aria-hidden="true">
              <span class="ib" :style="{ width: `${(r.count / max) * 100}%` }" />
            </td>
          </tr>
          <tr v-if="!rows.length"><td colspan="5" class="muted">No data.</td></tr>
        </tbody>
      </table>
    </div>
    <button v-if="rows.length > limit" class="more btn" type="button" @click="expanded = !expanded">
      {{ expanded ? 'Show fewer' : `Show all ${rows.length}` }}
    </button>
  </div>
</template>

<style scoped>
.rank { width: 3.6em; }
.label { word-break: break-word; }
.barcol { width: 22%; min-width: 60px; }
.ib { display: block; height: 6px; border-radius: 0 3px 3px 0; background: var(--ink-3); opacity: 0.55; }
.more { margin-top: 10px; }
@media (max-width: 560px) { .barcol { display: none; } }
</style>
