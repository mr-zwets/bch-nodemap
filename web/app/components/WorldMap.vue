<script setup lang="ts">
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature, merge, mesh } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { FeatureCollection } from 'geojson'
import world from 'world-atlas/countries-110m.json'
import type { NodeRow } from '#shared/types/api'
import { CONSENSUS_LABEL, CONSENSUS_STATUSES, type ConsensusStatus } from '#shared/utils/consensus'

export interface Cluster {
  key: string
  label: string
  country: string | null
  lat: number
  lon: number
  x: number
  y: number
  r: number
  count: number
  status: Record<ConsensusStatus, number>
  impls: Array<[string, number]>
}

const props = defineProps<{ nodes: NodeRow[]; colorBy: 'status' | 'impl' }>()

const W = 960
const H = 470
const topo = world as unknown as Topology<{ countries: GeometryCollection }>
const land = feature(topo, topo.objects.countries) as unknown as FeatureCollection
land.features = land.features.filter((f) => f.id !== '010') // Antarctica: no nodes, lots of ink
const projection = geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], land)
const path = geoPath(projection).digits(1)
// one merged land shape + interior borders drawn once: far fewer bytes than 170 country paths
const geoms = topo.objects.countries.geometries.filter((g) => g.id !== '010')
const landPath = path(merge(topo, geoms as Parameters<typeof merge>[1])) ?? ''
const borderPath = path(mesh(topo, { ...topo.objects.countries, geometries: geoms }, (a, b) => a !== b)) ?? ''

const clusters = computed<Cluster[]>(() => {
  const m = new Map<string, { lat: number; lon: number; n: number; country: string | null; city: string | null; status: Record<ConsensusStatus, number>; impls: Map<string, number> }>()
  for (const n of props.nodes) {
    if (n.lat == null || n.lon == null) continue
    const key = n.city ? `${n.country}|${n.city}` : `${n.country}|${n.lat.toFixed(1)},${n.lon.toFixed(1)}`
    const c = m.get(key) ?? { lat: 0, lon: 0, n: 0, country: n.country, city: n.city, status: { at_tip: 0, behind: 0, stalled: 0, unknown: 0 }, impls: new Map() }
    c.lat += n.lat
    c.lon += n.lon
    c.n++
    c.status[n.status]++
    c.impls.set(n.impl, (c.impls.get(n.impl) ?? 0) + 1)
    m.set(key, c)
  }
  const out: Cluster[] = []
  for (const [key, c] of m) {
    const lat = c.lat / c.n
    const lon = c.lon / c.n
    const p = projection([lon, lat])
    if (!p) continue
    out.push({
      key,
      label: c.city ? `${c.city}, ${countryName(c.country)}` : countryName(c.country),
      country: c.country,
      lat, lon,
      x: p[0], y: p[1],
      r: 2.6 + Math.sqrt(c.n) * 2.4,
      count: c.n,
      status: c.status,
      impls: [...c.impls].sort((a, b) => b[1] - a[1]),
    })
  }
  return out.sort((a, b) => b.count - a.count) // big first, small drawn on top
})

function dominantStatus(c: Cluster): ConsensusStatus {
  return CONSENSUS_STATUSES.reduce((best, s) => (c.status[s] > c.status[best] ? s : best), 'at_tip' as ConsensusStatus)
}
const fill = (c: Cluster) => (props.colorBy === 'status' ? statusColor(dominantStatus(c)) : implColor(c.impls[0]?.[0]))
// stalled nodes at a mostly-healthy location: separate small red dot sized by the stalled count only
const stalledBadge = (c: Cluster) => {
  if (props.colorBy !== 'status' || !c.status.stalled || dominantStatus(c) === 'stalled') return null
  const off = c.r * 0.72
  return { x: c.x + off, y: c.y - off, r: 1.6 + Math.sqrt(c.status.stalled) * 1.6 }
}

const hovered = ref<Cluster | null>(null)
defineExpose({ clusters })
</script>

<template>
  <div class="map" @mouseleave="hovered = null">
    <svg class="world" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`World map with ${clusters.length} node locations`">
      <path :d="landPath" class="land" />
      <path :d="borderPath" class="border" />
      <g>
        <circle
          v-for="c in clusters"
          :key="c.key"
          :cx="c.x"
          :cy="c.y"
          :r="c.r"
          :fill="fill(c)"
          class="dot"
          :class="{ on: hovered?.key === c.key }"
          tabindex="0"
          :aria-label="`${c.label}: ${c.count} nodes`"
          @mouseenter="hovered = c"
          @focus="hovered = c"
          @click="hovered = c"
        />
      </g>
      <g aria-hidden="true">
        <template v-for="c in clusters" :key="c.key">
          <circle v-if="stalledBadge(c)" v-bind="{ cx: stalledBadge(c)!.x, cy: stalledBadge(c)!.y, r: stalledBadge(c)!.r }" class="stalled" />
        </template>
      </g>
    </svg>
    <div
      v-if="hovered"
      class="tip"
      :style="{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / H) * 100}%` }"
      :class="{ flip: hovered.x > W * 0.62 }"
      role="status"
    >
      <b>{{ hovered.label }}</b>
      <div class="num">{{ hovered.count }} node{{ hovered.count === 1 ? '' : 's' }}</div>
      <ul>
        <li v-for="[impl, n] in hovered.impls" :key="impl"><span class="swatch" :style="{ background: implColor(impl) }" /> {{ impl }} <span class="num muted">{{ n }}</span></li>
      </ul>
      <ul class="st">
        <li v-for="s in CONSENSUS_STATUSES.filter((s) => hovered!.status[s])" :key="s">
          <StatusIcon :status="s" :size="10" /> {{ CONSENSUS_LABEL[s] }} <span class="num muted">{{ hovered.status[s] }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.map { position: relative; }
/* .world, not svg: a scoped `svg` rule would also hit child components' root <svg> (StatusIcon) */
.world { display: block; width: 100%; height: auto; }
.land { fill: var(--land); }
.border { fill: none; stroke: var(--land-stroke); stroke-width: 0.6; stroke-linejoin: round; }
.dot { fill-opacity: 0.82; stroke: var(--surface); stroke-width: 1.2; cursor: pointer; transition: fill-opacity 0.1s; }
.stalled { fill: var(--critical); stroke: var(--surface); stroke-width: 1; pointer-events: none; }
.dot:hover, .dot.on, .dot:focus-visible { fill-opacity: 1; stroke: var(--ink); stroke-width: 1.5; outline: none; }
.tip {
  position: absolute; transform: translate(14px, -50%); pointer-events: none; z-index: 2;
  background: var(--surface); border: 1px solid var(--rule-strong); border-radius: var(--radius);
  padding: 8px 10px; font-size: 0.82rem; min-width: 170px; max-width: 260px; box-shadow: 0 4px 18px rgb(0 0 0 / 0.12);
}
.tip.flip { transform: translate(calc(-100% - 14px), -50%); }
.tip ul { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 2px; }
.tip ul.st { border-top: 1px solid var(--rule); padding-top: 5px; }
.tip li { display: flex; align-items: center; gap: 6px; }
.tip li .num { margin-left: auto; }
</style>
