<script setup lang="ts">
import type { EChartsOption, LineSeriesOption } from 'echarts'
import type { HistoryResponse } from '#shared/types/api'
import { KNOWN_IMPLEMENTATIONS } from '#shared/utils/ua'
import { MAJOR_PROVIDERS } from '#shared/utils/provider'

useHead({ title: 'History' })
const router = useRouter()

const RANGES = [
  { id: 'all', label: 'All', from: undefined, to: undefined },
  { id: 'u2021', label: 'May 2021', from: '2021-04-15', to: '2021-06-20' },
  { id: 'u2022', label: 'May 2022', from: '2022-04-15', to: '2022-06-20' },
  { id: 'u2023', label: 'May 2023', from: '2023-04-15', to: '2023-06-20' },
  { id: 'recent', label: 'Last 90 days', from: 'recent', to: undefined },
] as const
const rangeId = ref<(typeof RANGES)[number]['id']>('all')
const bucket = ref<'auto' | 'day' | 'week'>('auto')

const baseQuery = computed(() => {
  const r = RANGES.find((x) => x.id === rangeId.value)!
  const from = r.from === 'recent' ? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10) : r.from
  return { bucket: bucket.value, from, to: r.to }
})

const [reach, impl, ver, prov] = await Promise.all([
  useFetch<HistoryResponse>('/api/history', { query: computed(() => ({ ...baseQuery.value, metric: 'reachable' })) }),
  useFetch<HistoryResponse>('/api/history', { query: computed(() => ({ ...baseQuery.value, metric: 'implementation' })) }),
  useFetch<HistoryResponse>('/api/history', { query: computed(() => ({ ...baseQuery.value, metric: 'version', top: 8 })) }),
  useFetch<HistoryResponse>('/api/history', { query: computed(() => ({ ...baseQuery.value, metric: 'provider', top: 8 })) }),
])

const v = useThemeVars(['--surface', '--surface-2', '--ink', '--ink-2', '--ink-3', '--rule', '--rule-strong', '--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8', '--s-other', '--impl-bchd'] as const)
const ready = computed(() => !!v.value['--ink'])

const pct = (c: number | null, t: number | undefined) => (c == null || !t ? null : Math.round((c / t) * 1000) / 10)
const color = (cssVar: string) => v.value[cssVar as keyof typeof v.value] ?? '#888'

const reachOption = computed<EChartsOption | null>(() => {
  const h = reach.data.value
  if (!h || !ready.value) return null
  const avg = h.series.find((s) => s.key === 'avg')!.data
  const min = h.series.find((s) => s.key === 'min')!.data
  const max = h.series.find((s) => s.key === 'max')!.data
  const o = baseOption(h, v.value, 'nodes')
  o.legend = { show: false }
  o.tooltip = {
    ...(o.tooltip as object),
    formatter: (ps: unknown) => {
      const p = (ps as Array<{ dataIndex: number; seriesName: string; value: [number, number | null] }>).find((x) => x.seriesName === 'Reachable nodes')
      if (!p || p.value[1] == null) return ''
      const i = h.points.findIndex((pt) => Date.parse(pt.t) === p.value[0])
      const pt = h.points[i]
      if (!pt) return ''
      return `<b>${fmtDate(pt.t)}</b>${h.bucket === 'week' ? ' (week)' : ''}<br>${fmtInt(avg[i])} reachable (mean)<br><span style="opacity:.7">range ${min[i]}–${max[i]} · ${pt.snapshots} snapshot${pt.snapshots === 1 ? '' : 's'} · ${pt.source}</span>`
    },
  }
  o.series = [
    annotations(h, v.value),
    { name: 'min', type: 'line', stack: 'band', data: withBreaks(h, min), symbol: 'none', lineStyle: { opacity: 0 }, itemStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
    {
      name: 'range', type: 'line', stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, itemStyle: { opacity: 0 }, silent: true,
      areaStyle: { color: color('--s1'), opacity: 0.14 },
      data: withBreaks(h, max.map((x, i) => (x == null || min[i] == null ? null : x - min[i]!))),
    },
    { name: 'Reachable nodes', type: 'line', data: withBreaks(h, avg), symbol: 'circle', symbolSize: 0, showAllSymbol: true, lineStyle: { width: 2, color: color('--s1') }, itemStyle: { color: color('--s1') } },
  ]
  return o
})

const implOption = computed<EChartsOption | null>(() => {
  const h = impl.data.value
  if (!h || !ready.value) return null
  const o = baseOption(h, v.value, '% of nodes', 100)
  o.tooltip = { ...(o.tooltip as object), valueFormatter: (x: unknown) => (x == null ? '—' : `${x}%`) }
  // implementations without a fixed colour slot are folded into one grey "Other" band
  const known = h.series.filter((s) => (KNOWN_IMPLEMENTATIONS as readonly string[]).includes(s.key))
  const rest = h.series.filter((s) => !known.includes(s))
  const series = rest.length
    ? [...known, { key: 'Other', data: h.points.map((_, i) => rest.reduce((a, s) => a + (s.data[i] ?? 0), 0)) }]
    : known
  o.series = [
    annotations(h, v.value),
    ...series.map<LineSeriesOption>((s) => ({
      name: s.key,
      type: 'line',
      stack: 'share',
      symbol: 'circle',
      symbolSize: 0,
      showAllSymbol: true,
      lineStyle: { width: 0 },
      areaStyle: { color: color(implVar(s.key)), opacity: 0.9 },
      itemStyle: { color: color(implVar(s.key)) },
      emphasis: { focus: 'series' },
      data: withBreaks(h, s.data.map((c, i) => pct(c, h.points[i]?.total))),
    })),
  ]
  o.legend = legendFor(o)
  return o
})

/** Share-of-all-nodes lines (version adoption, hosting). slotFor picks each series' colour. */
function shareLines(h: HistoryResponse, yName: string, slotFor: (key: string, i: number) => string): EChartsOption {
  const o = baseOption(h, v.value, yName, 100)
  o.tooltip = { ...(o.tooltip as object), valueFormatter: (x: unknown) => (x == null ? '—' : `${x}%`) }
  o.series = [
    annotations(h, v.value),
    ...h.series.map<LineSeriesOption>((s, i) => {
      const c = s.key === 'Other' ? color('--s-other') : color(slotFor(s.key, i))
      return {
        name: s.key,
        type: 'line',
        symbol: 'circle',
        symbolSize: 0,
        showAllSymbol: true,
        lineStyle: { width: 2, color: c },
        itemStyle: { color: c },
        emphasis: { focus: 'series' },
        data: withBreaks(h, s.data.map((x, j) => pct(x, h.points[j]?.total))),
      }
    }),
  ]
  o.legend = legendFor(o)
  return o
}

// release lines are sorted by version, so slot order follows version order
const verOption = computed<EChartsOption | null>(() => {
  const h = ver.data.value
  if (!h || !ready.value) return null
  return shareLines(h, '% of all nodes', (_k, i) => SLOT_VARS[i % SLOT_VARS.length]!)
})

// major providers keep a fixed colour; any other provider in the top 8 takes a free slot
const provOption = computed<EChartsOption | null>(() => {
  const h = prov.data.value
  if (!h || !ready.value) return null
  const fixed = new Map(MAJOR_PROVIDERS.map((p, i) => [p, SLOT_VARS[i]!]))
  const used = new Set(h.series.map((s) => fixed.get(s.key)).filter(Boolean))
  const free = SLOT_VARS.filter((sv) => !used.has(sv))
  const extra = new Map<string, string>()
  return shareLines(h, '% of all nodes', (k) => {
    if (fixed.has(k)) return fixed.get(k)!
    if (!extra.has(k)) extra.set(k, free[extra.size % Math.max(1, free.length)] ?? '--s-other')
    return extra.get(k)!
  })
})

function openSnapshot(e: unknown, h: HistoryResponse | undefined) {
  const p = e as { value?: [number, number | null] }
  if (!h || !p.value) return
  const pt = h.points.find((x) => Date.parse(x.t) === p.value![0])
  if (pt?.snapshotId) router.push({ path: '/', query: { snapshot: String(pt.snapshotId) } })
}

const sourceSummary = computed(() => reach.data.value?.sources ?? [])
const gaps = computed(() => reach.data.value?.gaps ?? [])
const tableOpen = ref(false)
</script>

<template>
  <div class="hist">
    <header class="head">
      <div>
        <h1>History</h1>
        <p class="muted lede">
          Bitcoin Cash reachable nodes since November 2020. Until April 2024 the data comes from Bitcoin Unlimited’s
          <a href="https://gitlab.com/bitcoinunlimited/cashnodes" rel="noopener"><b>cashnodes</b></a> crawler (archived, ≈ one snapshot a day, denser around upgrades); from October 2026 from the
          <b>bch-nodemap</b> crawler. The period in between has no data and is shown as a gap, not interpolated.
        </p>
      </div>
      <div class="controls">
        <div class="seg" role="group" aria-label="Time range">
          <button v-for="r in RANGES" :key="r.id" type="button" :aria-pressed="rangeId === r.id" @click="rangeId = r.id">{{ r.label }}</button>
        </div>
        <div class="seg" role="group" aria-label="Bucket">
          <button v-for="b in ['auto', 'day', 'week'] as const" :key="b" type="button" :aria-pressed="bucket === b" @click="bucket = b">{{ b }}</button>
        </div>
      </div>
    </header>

    <p v-if="reach.data.value && !reach.data.value.points.length" class="panel empty">
      No snapshots in this range yet{{ rangeId.startsWith('u') ? ' — the cashnodes archive for this period may still be importing' : '' }}.
    </p>

    <section class="panel">
      <div class="panel-head">
        <h2>Reachable nodes</h2>
        <span class="small muted">mean per {{ reach.data.value?.bucket ?? 'bucket' }}, band = min–max</span>
      </div>
      <EChart v-if="reachOption" :option="reachOption" :height="300" />
      <div v-else class="ph" style="height: 300px" />
      <p class="src small muted">
        <span v-for="s in sourceSummary" :key="s.from" class="srcitem">{{ s.source === 'cashnodes' ? 'cashnodes archive' : 'bch-nodemap crawler' }}: {{ fmtDate(s.from) }} → {{ fmtDate(s.to) }}</span>
        <span v-for="g in gaps" :key="g.from" class="srcitem">gap: {{ fmtDate(g.from) }} → {{ fmtDate(g.to) }}</span>
      </p>
      <details @toggle="tableOpen = ($event.target as HTMLDetailsElement).open">
        <summary class="small">Data table</summary>
        <div v-if="tableOpen && reach.data.value" class="table-scroll dt">
          <table class="data">
            <thead><tr><th>{{ reach.data.value.bucket === 'week' ? 'Week of' : 'Day' }}</th><th>Source</th><th class="r">Mean</th><th class="r">Min</th><th class="r">Max</th><th class="r">Snapshots</th></tr></thead>
            <tbody>
              <tr v-for="(p, i) in reach.data.value.points" :key="p.t">
                <td class="num">{{ fmtDate(p.t) }}</td><td>{{ p.source }}</td>
                <td class="r">{{ reach.data.value.series[0]!.data[i] }}</td><td class="r">{{ reach.data.value.series[1]!.data[i] }}</td>
                <td class="r">{{ reach.data.value.series[2]!.data[i] }}</td><td class="r">{{ p.snapshots }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Implementation share</h2>
        <span class="small muted">one snapshot per {{ impl.data.value?.bucket ?? 'bucket' }} (the latest) · click to open it</span>
      </div>
      <EChart v-if="implOption" :option="implOption" :height="320" @click="openSnapshot($event, impl.data.value ?? undefined)" />
      <div v-else class="ph" style="height: 320px" />
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Version adoption</h2>
        <span class="small muted">BCHN and BCHU release lines, share of all reachable nodes</span>
      </div>
      <EChart v-if="verOption" :option="verOption" :height="320" @click="openSnapshot($event, ver.data.value ?? undefined)" />
      <div v-else class="ph" style="height: 320px" />
      <p class="small muted">
        Release lines with the highest peak share are shown; everything else is “Other”. Vertical rules mark the May network upgrades.
      </p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Hosting</h2>
        <span class="small muted">top networks by peak share; AS organisations merged per provider</span>
      </div>
      <EChart v-if="provOption" :option="provOption" :height="320" @click="openSnapshot($event, prov.data.value ?? undefined)" />
      <div v-else class="ph" style="height: 320px" />
      <p class="small muted">
        Provider names are normalised across GeoIP vendors (MaxMind in the archive, DB-IP for the crawler), so e.g. Choopa /
        The Constant Company / Vultr are one line. “Other” includes nodes without a known AS organisation.
      </p>
    </section>

    <p class="small muted method">
      Method: reachable = {{ reach.data.value?.aggregation }}<br>
      Shares = {{ impl.data.value?.aggregation }}
    </p>
  </div>
</template>

<style scoped>
.hist { display: grid; gap: 20px; }
.head { display: grid; gap: 14px; }
.lede { max-width: 72ch; margin: 6px 0 0; }
.controls { display: flex; gap: 10px; flex-wrap: wrap; }
.ph { background: var(--surface-2); border-radius: var(--radius); opacity: 0.5; }
.src { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 8px 0 0; }
details { margin-top: 8px; }
summary { cursor: pointer; color: var(--ink-2); }
.dt { max-height: 360px; overflow-y: auto; margin-top: 8px; }
.empty { margin: 0; }
.method { margin: 0; max-width: 90ch; }
</style>
