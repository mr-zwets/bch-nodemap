<script setup lang="ts">
import type { NodeRow, NodesResponse } from '#shared/types/api'
import { CONSENSUS_LABEL, CONSENSUS_STATUSES, type ConsensusStatus } from '#shared/utils/consensus'

useHead({ title: 'Map' })
// keep only what the map needs so the SSR payload stays small
const { data, error } = await useFetch<NodesResponse>('/api/nodes', {
  query: { snapshot: 'latest' },
  transform: (r) => ({
    ...r,
    nodes: r.nodes.map((n) => ({ lat: n.lat, lon: n.lon, city: n.city, country: n.country, impl: n.impl, status: n.status }) as NodeRow),
  }),
})
const colorBy = ref<'status' | 'impl'>('status')

const located = computed(() => (data.value?.nodes ?? []).filter((n) => n.lat != null && n.lon != null))
const unlocated = computed(() => (data.value?.nodes.length ?? 0) - located.value.length)

const legendImpls = computed(() => {
  const m = new Map<string, number>()
  for (const n of located.value) m.set(n.impl, (m.get(n.impl) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
})
const legendStatus = computed(() => {
  const m: Record<ConsensusStatus, number> = { at_tip: 0, behind: 0, stalled: 0, unknown: 0 }
  for (const n of located.value) m[n.status]++
  return CONSENSUS_STATUSES.filter((s) => m[s]).map((s) => [s, m[s]] as const)
})

const byPlace = computed(() => {
  const m = new Map<string, { label: string; country: string | null; count: number; atTip: number }>()
  for (const n of data.value?.nodes ?? []) {
    const key = `${n.country}|${n.city ?? ''}`
    const e = m.get(key) ?? { label: n.city ?? '—', country: n.country, count: 0, atTip: 0 }
    e.count++
    if (n.status === 'at_tip') e.atTip++
    m.set(key, e)
  }
  return [...m.values()].sort((a, b) => b.count - a.count)
})
const showAll = ref(false)
</script>

<template>
  <div>
    <header class="head">
      <div>
        <h1>Where the nodes are</h1>
        <p v-if="data" class="muted">
          {{ fmtInt(located.length) }} nodes in {{ byPlace.length }} places · crawl of {{ fmtDateTime(data.snapshot.takenAt) }}
          <template v-if="unlocated"> · {{ unlocated }} without a location</template>
        </p>
      </div>
      <div class="seg" role="group" aria-label="Colour dots by">
        <button type="button" :aria-pressed="colorBy === 'status'" @click="colorBy = 'status'">Consensus</button>
        <button type="button" :aria-pressed="colorBy === 'impl'" @click="colorBy = 'impl'">Implementation</button>
      </div>
    </header>

    <div v-if="error" class="panel">Couldn’t load nodes ({{ error.statusCode }}).</div>
    <template v-else-if="data">
      <div class="panel mappanel">
        <WorldMap :nodes="data.nodes" :color-by="colorBy" />
        <div class="legend small">
          <template v-if="colorBy === 'status'">
            <span v-for="[s, n] in legendStatus" :key="s" class="li"><StatusIcon :status="s" /> {{ CONSENSUS_LABEL[s] }} <span class="muted num">{{ n }}</span></span>
            <span class="li muted"><svg width="16" height="14" aria-hidden="true"><circle cx="6" cy="8" r="5" fill="var(--good)" fill-opacity="0.82" /><circle cx="11.5" cy="3.5" r="2.6" fill="var(--critical)" stroke="var(--surface)" stroke-width="1" /></svg> small red dot: stalled nodes at that location</span>
          </template>
          <template v-else>
            <span v-for="[i, n] in legendImpls" :key="i" class="li"><span class="swatch" :style="{ background: implColor(i) }" /> {{ i }} <span class="muted num">{{ n }}</span></span>
            <span class="li muted">colour = most common implementation at that location</span>
          </template>
          <span class="li muted">dot area ∝ node count · locations are approximate (GeoIP)</span>
        </div>
      </div>

      <section class="panel places">
        <div class="panel-head"><h2>Locations</h2></div>
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>City</th><th>Country</th><th class="r">Nodes</th><th class="r">At tip</th></tr></thead>
            <tbody>
              <tr v-for="p in showAll ? byPlace : byPlace.slice(0, 20)" :key="`${p.country}|${p.label}`">
                <td>{{ p.label }}</td>
                <td><NuxtLink v-if="p.country" :to="{ path: '/nodes', query: { country: p.country } }">{{ countryName(p.country) }}</NuxtLink><span v-else>—</span></td>
                <td class="r">{{ p.count }}</td>
                <td class="r">{{ p.atTip }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button v-if="byPlace.length > 20" type="button" class="btn more" @click="showAll = !showAll">{{ showAll ? 'Show fewer' : `Show all ${byPlace.length}` }}</button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.head p { margin: 4px 0 0; }
.mappanel { padding: 10px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 10px 6px 2px; color: var(--ink-2); }
.li { display: inline-flex; align-items: center; gap: 6px; }
.places { margin-top: 20px; }
.more { margin-top: 10px; }
</style>
