<script setup lang="ts">
import type { NodeRow, NodesResponse, SnapshotSummary } from '#shared/types/api'
import { CONSENSUS_LABEL, CONSENSUS_STATUSES } from '#shared/utils/consensus'

useHead({ title: 'Nodes' })
const route = useRoute()
const router = useRouter()

const qs = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
const search = ref(qs('q'))
const filters = computed(() => ({
  snapshot: qs('snapshot') || 'latest',
  q: qs('q') || undefined,
  country: qs('country') || undefined,
  ua: qs('ua') || undefined,
  ua_base: qs('ua_base') || undefined,
  provider: qs('provider') || undefined,
  impl: qs('impl') || undefined,
  status: qs('status') || undefined,
  net: qs('net') || undefined,
}))

const { data, error, pending } = await useFetch<NodesResponse>('/api/nodes', {
  query: filters,
  transform: (r) => ({
    ...r,
    nodes: r.nodes.map(({ lat: _lat, lon: _lon, services: _s, protocolVersion: _pv, ...n }) => n as NodeRow),
  }),
})
// snapshot summary (cached server-side) supplies the country / implementation option lists
const { data: summary } = await useFetch<SnapshotSummary>(() =>
  filters.value.snapshot === 'latest' ? '/api/snapshots/latest' : `/api/snapshots/${filters.value.snapshot}`,
)

function setQuery(patch: Record<string, string | undefined>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) if (typeof v === 'string' && v) next[k] = v
  router.replace({ query: next })
}
let t: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(t)
  t = setTimeout(() => setQuery({ q: v.trim() || undefined }), 250)
})
watch(() => route.query.q, (v) => { if ((v ?? '') !== search.value.trim()) search.value = typeof v === 'string' ? v : '' })

const countries = computed(() =>
  (summary.value?.byCountry ?? [])
    .filter((c) => c.key !== 'unknown')
    .map((c) => [c.key, c.count] as const)
    .sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0]))),
)
const impls = computed(() => (summary.value?.byImplementation ?? []).map((r) => r.key))

type SortKey = 'status' | 'address' | 'ua' | 'height' | 'country' | 'org' | 'firstSeen' | 'latency'
const sortKey = ref<SortKey>('status')
const sortDir = ref<1 | -1>(1)
const statusRank = { at_tip: 0, behind: 1, stalled: 2, unknown: 3 } as const
const getters: Record<SortKey, (n: NodeRow) => string | number | null> = {
  status: (n) => statusRank[n.status],
  address: (n) => n.address,
  ua: (n) => n.userAgent,
  height: (n) => n.height,
  country: (n) => (n.country ? countryName(n.country) + (n.city ?? '') : null),
  org: (n) => n.provider,
  firstSeen: (n) => (n.firstSeen ? Date.parse(n.firstSeen) : null),
  latency: (n) => n.latencyMs,
}
// Within a status, the safest nodes first: latest BCHN release, then other
// latest releases, then BCHN by version (newest first), then everything else.
const releases = useReleases()
function safety(a: NodeRow, b: NodeRow): number {
  const tag = (n: NodeRow) => (releaseTag(n.impl, n.version, releases.value) === 'latest' ? 0 : 1)
  const bchn = (n: NodeRow) => (n.impl === 'Bitcoin Cash Node' ? 0 : 1)
  return tag(a) - tag(b) || bchn(a) - bchn(b) || compareVersions(b.version, a.version)
}
const rows = computed(() => {
  const g = getters[sortKey.value]
  return [...(data.value?.nodes ?? [])].sort((a, b) => {
    const x = g(a)
    const y = g(b)
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1
    const primary = (x < y ? -1 : x > y ? 1 : 0) * sortDir.value
    if (primary) return primary
    return (sortKey.value === 'status' ? safety(a, b) : 0) || a.address.localeCompare(b.address)
  })
})
function sortBy(k: SortKey) {
  if (sortKey.value === k) sortDir.value = sortDir.value === 1 ? -1 : 1
  else {
    sortKey.value = k
    sortDir.value = k === 'height' || k === 'firstSeen' ? -1 : 1
  }
}
const aria = (k: SortKey) => (sortKey.value === k ? (sortDir.value === 1 ? 'ascending' : 'descending') : 'none')
const cols: Array<{ k: SortKey; label: string; r?: boolean }> = [
  { k: 'status', label: 'Status' },
  { k: 'address', label: 'Address' },
  { k: 'ua', label: 'User agent' },
  { k: 'height', label: 'Height', r: true },
  { k: 'country', label: 'Location' },
  { k: 'org', label: 'Network' },
  { k: 'firstSeen', label: 'First seen' },
  { k: 'latency', label: 'Latency', r: true },
]
const anyFilter = computed(() => ['q', 'country', 'ua', 'ua_base', 'provider', 'impl', 'status', 'net'].some((k) => qs(k)))
const chips = computed(() =>
  [
    { k: 'ua', label: 'User agent contains' },
    { k: 'ua_base', label: 'User agent' },
    { k: 'provider', label: 'Network' },
  ].filter((c) => qs(c.k)),
)
</script>

<template>
  <div>
    <header class="head">
      <div>
        <h1>Nodes</h1>
        <p v-if="data" class="muted">
          {{ fmtInt(data.total) }} {{ anyFilter ? 'matching' : 'reachable' }} nodes · crawl of {{ fmtDateTime(data.snapshot.takenAt) }}
          · tip {{ fmtInt(data.tip) }}
          <template v-if="data.snapshot.source === 'cashnodes'"> · cashnodes archive (heights may be stale)</template>
        </p>
      </div>
    </header>

    <form class="filters" role="search" @submit.prevent>
      <label class="grow">
        <span class="visually-hidden">Search</span>
        <input v-model="search" type="search" placeholder="Search address, host, user agent, AS, city…" />
      </label>
      <label>
        <span class="visually-hidden">Status</span>
        <select :value="qs('status')" @change="setQuery({ status: ($event.target as HTMLSelectElement).value })">
          <option value="">Any status</option>
          <option v-for="st in CONSENSUS_STATUSES" :key="st" :value="st">{{ CONSENSUS_LABEL[st] }}</option>
        </select>
      </label>
      <label>
        <span class="visually-hidden">Implementation</span>
        <select :value="qs('impl')" @change="setQuery({ impl: ($event.target as HTMLSelectElement).value })">
          <option value="">All implementations</option>
          <option v-for="i in impls" :key="i" :value="i">{{ i }}</option>
        </select>
      </label>
      <label>
        <span class="visually-hidden">Country</span>
        <select :value="qs('country')" @change="setQuery({ country: ($event.target as HTMLSelectElement).value })">
          <option value="">All countries</option>
          <option v-for="[c, n] in countries" :key="c" :value="c">{{ countryName(c) }} ({{ n }})</option>
        </select>
      </label>
      <label>
        <span class="visually-hidden">Network</span>
        <select :value="qs('net')" @change="setQuery({ net: ($event.target as HTMLSelectElement).value })">
          <option value="">All networks</option>
          <option v-for="(l, k) in NET_LABEL" :key="k" :value="k">{{ l }}</option>
        </select>
      </label>
      <label class="mobile-sort">
        <span class="visually-hidden">Sort by</span>
        <select :value="sortKey" @change="sortBy(($event.target as HTMLSelectElement).value as SortKey)">
          <option v-for="c in cols" :key="c.k" :value="c.k">Sort: {{ c.label }}</option>
        </select>
      </label>
      <button v-if="anyFilter" type="button" class="btn" @click="search = ''; router.replace({ query: qs('snapshot') ? { snapshot: qs('snapshot') } : {} })">
        Clear
      </button>
    </form>
    <div v-if="chips.length" class="chips">
      <p v-for="c in chips" :key="c.k" class="chip">
        {{ c.label }} <code>{{ qs(c.k) }}</code>
        <button type="button" :aria-label="`Remove ${c.label} filter`" @click="setQuery({ [c.k]: undefined })">×</button>
      </p>
    </div>

    <div v-if="error" class="panel">Couldn’t load nodes ({{ error.statusCode }}).</div>
    <div v-else class="panel tbl" :class="{ loading: pending }">
      <div class="table-scroll">
        <table class="data nodes">
          <thead>
            <tr>
              <th v-for="c in cols" :key="c.k" :class="{ r: c.r }" :aria-sort="aria(c.k)">
                <button type="button" class="sort" @click="sortBy(c.k)">
                  {{ c.label }}<span class="arrow" aria-hidden="true">{{ sortKey === c.k ? (sortDir === 1 ? '↑' : '↓') : '' }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in rows" :key="`${n.address}:${n.port}`" :class="n.status">
              <td class="c-status"><StatusBadge :status="n.status" /></td>
              <td class="mono addr c-addr">
                {{ endpoint(n.address, n.port) }}
                <div v-if="n.hostname && n.hostname !== n.address" class="sub" :title="n.hostname">{{ n.hostname }}</div>
              </td>
              <td class="mono ua c-ua"><span class="swatch" :style="{ background: implColor(n.impl) }" /> {{ n.userAgent || '(empty)' }}<ReleaseBadge :impl="n.impl" :version="n.version" /></td>
              <td class="r num c-height" data-label="Height">{{ n.height == null ? '—' : fmtInt(n.height) }}<div v-if="n.height != null && data?.tip != null && data.tip - n.height > 2" class="sub">−{{ fmtInt(data.tip - n.height) }}</div></td>
              <td class="c-loc"><span v-if="n.country" class="flag" aria-hidden="true">{{ flag(n.country) }}</span>{{ n.country ? countryName(n.country) : '—' }}<div v-if="n.city" class="sub">{{ n.city }}</div></td>
              <td class="org c-org">{{ n.provider }}<div class="sub" :title="n.org ?? undefined">{{ n.org && n.org !== n.provider ? n.org : '' }}<span v-if="n.asn" class="mono"> AS{{ n.asn }}</span></div></td>
              <td class="num nowrap c-seen" data-label="First seen">{{ fmtDate(n.firstSeen) }}</td>
              <td class="r num c-lat" data-label="Latency">{{ n.latencyMs == null ? '—' : `${n.latencyMs} ms` }}</td>
            </tr>
            <tr v-if="!rows.length"><td :colspan="cols.length" class="muted">No nodes match.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head { margin-bottom: 16px; }
.head p { margin: 4px 0 0; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.filters .grow { flex: 1 1 260px; }
.filters .grow input { width: 100%; }
.filters select { max-width: 220px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 3px 4px 3px 10px; border-radius: 999px; background: var(--accent-wash); font-size: 0.85rem; }
.chip button { border: 0; background: none; color: var(--ink-2); cursor: pointer; font-size: 1rem; padding: 0 6px; }
.tbl { padding: 6px 8px; }
.tbl.loading { opacity: 0.6; }
.nodes { font-size: 0.86rem; }
.nodes th { padding: 0; }
.sort { font: inherit; text-transform: inherit; letter-spacing: inherit; color: inherit; background: none; border: 0; padding: 8px 10px; cursor: pointer; white-space: nowrap; width: 100%; text-align: inherit; }
.arrow { display: inline-block; width: 1em; }
.sub { font-size: 0.78rem; color: var(--ink-3); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.addr { white-space: nowrap; }
.ua { min-width: 220px; word-break: break-word; }
.ua .swatch { margin-right: 4px; }
.org { min-width: 140px; }
.nowrap { white-space: nowrap; }
.mobile-sort { display: none; }
@media (max-width: 700px) {
  .mobile-sort { display: block; }
  .tbl { padding: 0; background: none; border: 0; }
  .nodes thead { display: none; }
  .nodes, .nodes tbody { display: block; }
  .nodes tr {
    display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 10px 12px;
    background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius); margin-bottom: 8px;
  }
  .nodes td, .nodes td.r { display: block; padding: 0; border: 0; background: none !important; box-shadow: none !important; text-align: left; min-width: 0; }
  .nodes .c-addr { grid-column: 1; grid-row: 1; font-weight: 600; white-space: normal; word-break: break-all; }
  .nodes .c-status { grid-column: 2; grid-row: 1; }
  .nodes .c-ua { grid-column: 1 / -1; min-width: 0; }
  .nodes .c-loc, .nodes .c-org { grid-column: auto; font-size: 0.82rem; }
  .nodes .c-height, .nodes .c-seen, .nodes .c-lat { font-size: 0.82rem; color: var(--ink-2); }
  .nodes .c-height::before, .nodes .c-seen::before, .nodes .c-lat::before { content: attr(data-label) ' '; color: var(--ink-3); }
  .nodes .c-height .sub { display: inline; margin-left: 4px; }
  .sub { max-width: none; }
  .nodes tr.stalled { border-left: 3px solid var(--critical); background: color-mix(in srgb, var(--critical) 7%, var(--surface)); }
  .nodes tr.behind { border-left: 3px solid var(--warning); }
}
tr.stalled td { background: color-mix(in srgb, var(--critical) 7%, transparent); }
tr.stalled td:first-child { box-shadow: inset 3px 0 0 var(--critical); }
tr.behind td:first-child { box-shadow: inset 3px 0 0 var(--warning); }
.flag { margin-right: 6px; }
</style>
