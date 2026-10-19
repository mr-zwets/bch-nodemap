<script setup lang="ts">
import type { ConsensusCounts, SnapshotSummary, VersionRow } from '#shared/types/api'
import { CONSENSUS_LABEL, CONSENSUS_STATUSES, AT_TIP_MAX_LAG, BEHIND_MAX_LAG, stallLabel } from '#shared/utils/consensus'
import { implShort, parseUserAgent } from '#shared/utils/ua'

const route = useRoute()
const snapshotId = computed(() => (typeof route.query.snapshot === 'string' && /^\d+$/.test(route.query.snapshot) ? route.query.snapshot : null))
const url = computed(() => (snapshotId.value ? `/api/snapshots/${snapshotId.value}` : '/api/snapshots/latest'))
const { data, error } = await useFetch<SnapshotSummary>(url)
if (error.value?.statusCode === 404 && snapshotId.value) {
  throw createError({ statusCode: 404, statusMessage: `Snapshot ${snapshotId.value} not found`, fatal: true })
}
const mounted = useMounted()

useHead({ title: () => (snapshotId.value ? `Snapshot ${snapshotId.value}` : 'Overview') })

const s = computed(() => data.value)
const total = computed(() => s.value?.nodes ?? 0)

const implItems = computed(() =>
  (s.value?.byImplementation ?? []).map((r) => ({ key: r.key, label: r.key, count: r.count, color: implColor(r.key) })),
)
const statusItems = (r: ConsensusCounts) =>
  CONSENSUS_STATUSES.map((st) => ({ key: st, label: CONSENSUS_LABEL[st], count: r[st], color: statusColor(st) }))
const STATUS_HINT: Record<string, string> = {
  at_tip: `At most ${AT_TIP_MAX_LAG} blocks behind the tip.`,
  behind: `${AT_TIP_MAX_LAG + 1}–${BEHIND_MAX_LAG} blocks behind: usually syncing or just restarted.`,
  stalled: `More than ${BEHIND_MAX_LAG} blocks behind: stuck, or rejecting the chain (off consensus).`,
  unknown: 'The node did not report a height.',
}
const consensusItems = computed(() =>
  CONSENSUS_STATUSES.map((st) => ({ key: st, label: CONSENSUS_LABEL[st], count: s.value?.consensus[st] ?? 0, color: statusColor(st) })),
)

// The classic cashnodes tabs first (User Agent / Country / Network), then extras.
type Tab = 'ua' | 'country' | 'net' | 'version' | 'addr' | 'height'
const tabs: Array<{ id: Tab; label: string; heading: string }> = [
  { id: 'ua', label: 'User Agent', heading: 'User Agent' },
  { id: 'country', label: 'Country', heading: 'Country' },
  { id: 'net', label: 'Network', heading: 'Network' },
  { id: 'version', label: 'Version', heading: 'Implementation & version' },
  { id: 'addr', label: 'Address type', heading: 'Address type' },
  { id: 'height', label: 'Height', heading: 'Height' },
]
const tab = ref<Tab>(tabs.some((t) => t.id === route.query.tab) ? (route.query.tab as Tab) : 'ua')
const rows = computed<Array<{ key: string; count: number; title?: string }>>(() => {
  const v = s.value
  if (!v) return []
  switch (tab.value) {
    case 'ua': return v.byUserAgent
    case 'country': return v.byCountry
    case 'net': return v.byProvider.map((p) => ({ key: p.key, count: p.count, title: [...p.orgs, ...p.asns.map((a) => `AS${a}`)].join(' · ') }))
    case 'version': return v.byVersion
    case 'addr': return v.byNet
    default: return []
  }
})
const withSnap = (q: Record<string, string>) => ({ path: '/nodes', query: { ...q, ...(snapshotId.value ? { snapshot: snapshotId.value } : {}) } })
const heading = computed(() => tabs.find((t) => t.id === tab.value)!.heading)

// Table or pie for the breakdown tabs; ?view=pie, else remembered per browser (default table)
type View = 'table' | 'pie'
const view = ref<View>(route.query.view === 'pie' ? 'pie' : 'table')
onMounted(() => {
  if (route.query.view) return
  try {
    if (localStorage.getItem('nodemap:view') === 'pie') view.value = 'pie'
  } catch {}
})
function setView(v: View) {
  view.value = v
  try {
    localStorage.setItem('nodemap:view', v)
  } catch {}
}
// UA and version slices are shaded by implementation colour; other tabs use a neutral ramp
const pieImpl = computed(() => {
  if (tab.value === 'ua') return (row: { key: string }) => parseUserAgent(row.key).impl
  if (tab.value === 'version') return (row: { key: string }) => (row as unknown as VersionRow).impl
  return undefined
})
function pieLabel(row: { key: string }) {
  switch (tab.value) {
    case 'country': return `${flag(row.key)} ${countryName(row.key)}`
    case 'addr': return NET_LABEL[row.key] ?? row.key
    default: return row.key
  }
}

const stallOf = (height: number | null) => (s.value ? stallLabel(height, s.value.tip.height, s.value.snapshot.takenAt) : null)

function versionRelease(row: { key: string }) {
  const r = row as unknown as VersionRow
  return { impl: r.impl, version: r.version }
}
function uaRelease(ua: string) {
  const p = parseUserAgent(ua)
  return { impl: p.impl, version: p.version }
}
</script>

<template>
  <div v-if="error" class="panel">
    <h1>Couldn’t load the snapshot</h1>
    <p class="muted">{{ error.statusCode === 404 ? 'No snapshot found.' : 'The database is unavailable right now.' }}</p>
  </div>

  <div v-else-if="s" class="overview">
    <section class="hero">
      <div class="hero-main">
        <p class="eyebrow">Bitcoin Cash · {{ s.snapshot.network }}</p>
        <h1 class="count">
          <span class="n">{{ fmtInt(s.snapshot.reachable) }}</span>
          <span class="unit">reachable nodes</span>
        </h1>
        <p class="meta">
          <span>Crawl of {{ fmtDateTime(s.snapshot.takenAt) }}</span>
          <span v-if="mounted" class="muted">({{ fmtAgo(s.snapshot.takenAt) }})</span>
          <span v-if="s.snapshot.discovered" class="muted">· {{ fmtInt(s.snapshot.discovered) }} addresses discovered</span>
          <span v-if="s.snapshot.durationMs" class="muted">· {{ Math.round(s.snapshot.durationMs / 1000) }} s</span>
        </p>
        <p v-if="s.snapshot.source === 'cashnodes'" class="archive-note">
          Archived snapshot from Bitcoin Unlimited’s cashnodes crawler.
          <NuxtLink to="/">Back to the latest crawl</NuxtLink>
        </p>
        <p v-else-if="snapshotId" class="archive-note">Historical snapshot #{{ s.snapshot.id }}. <NuxtLink to="/">Latest crawl</NuxtLink></p>
        <nav class="jump" aria-label="Explore">
          <NuxtLink to="/map">Map →</NuxtLink>
          <NuxtLink :to="withSnap({})">All {{ fmtInt(total) }} nodes →</NuxtLink>
          <!-- <NuxtLink to="/history">History since 2020 →</NuxtLink> (hidden with the nav link) -->
        </nav>
      </div>

      <div class="panel consensus" aria-labelledby="consensus-h">
        <div class="panel-head">
          <h2 id="consensus-h">Consensus</h2>
          <span class="small muted tiph">
            tip <b class="num ink-2">{{ fmtInt(s.tip.height) }}</b>
            <InfoTip label="How the tip is determined" :text="`The tip is the ${s.tip.rule}. Heights are what each node reported when we connected.`" />
          </span>
        </div>
        <ShareBar :items="consensusItems" :height="10" label="Consensus status" />
        <ul class="statlist">
          <li v-for="c in consensusItems" v-show="c.key !== 'unknown' || c.count > 0" :key="c.key">
            <StatusIcon :status="c.key as any" />
            <span class="sl">{{ c.label }} <InfoTip v-if="STATUS_HINT[c.key]" align="left" :label="`What ${c.label} means`" :text="STATUS_HINT[c.key]!" /></span>
            <span class="num sv">{{ fmtInt(c.count) }}</span>
            <span class="num muted sp">{{ fmtPct(c.count, total, 0) }}</span>
          </li>
        </ul>
        <p v-if="!s.heightsReliable" class="small muted note">
          <b>Archive caveat:</b> cashnodes kept long-lived connections, so these heights can be stale.
        </p>
      </div>
    </section>

    <section class="panel impl" aria-labelledby="impl-h">
      <div class="panel-head">
        <h2 id="impl-h">Implementations</h2>
        <span class="small muted">share of reachable nodes · in consensus</span>
      </div>
      <ShareBar :items="implItems" label="Implementation share" />
      <div class="table-scroll">
        <table class="data impl-table">
          <thead>
            <tr>
              <th>Implementation</th>
              <th class="r">Nodes</th>
              <th class="r hide-sm">Share</th>
              <th>At tip</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in s.byImplementation" :key="r.key" :class="{ allstalled: r.stalled === r.count }">
              <td><span class="swatch" :style="{ background: implColor(r.key) }" /> {{ r.key }}</td>
              <td class="r">{{ fmtInt(r.count) }}</td>
              <td class="r muted hide-sm">{{ fmtPct(r.count, total) }}</td>
              <td>
                <div class="attip">
                  <span class="num"><b>{{ r.at_tip }}</b> of {{ r.count }}</span>
                  <ShareBar
                    class="mini"
                    :height="6"
                    :items="statusItems(r)"
                    :label="`${implShort(r.key)}: ${r.at_tip} at tip, ${r.behind} behind, ${r.stalled} stalled`"
                  />
                  <span v-if="r.stalled" class="stalled-note"><StatusIcon status="stalled" :size="10" /> {{ r.stalled }} stalled</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel tables" aria-labelledby="tables-h">
      <h2 id="tables-h" class="visually-hidden">Breakdown tables</h2>
      <div class="tabs-row">
      <div class="tabs" role="tablist">
        <button
          v-for="t in tabs"
          :id="`tab-${t.id}`"
          :key="t.id"
          role="tab"
          type="button"
          :aria-selected="tab === t.id"
          :aria-controls="`tp-${t.id}`"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <div v-if="tab !== 'height'" class="seg view-toggle" role="group" aria-label="Show as">
        <button type="button" :aria-pressed="view === 'table'" @click="setView('table')">Table</button>
        <button type="button" :aria-pressed="view === 'pie'" @click="setView('pie')">Pie</button>
      </div>
      </div>
      <div :id="`tp-${tab}`" role="tabpanel" :aria-labelledby="`tab-${tab}`">
        <div v-if="tab === 'height'" class="table-scroll">
          <table class="data">
            <thead>
              <tr><th>Height</th><th class="r">Blocks behind tip</th><th class="r">Nodes</th><th>Status</th><th>Stuck at</th></tr>
            </thead>
            <tbody>
              <tr v-for="h in s.heights" :key="String(h.height)">
                <td class="num">{{ h.height == null ? '—' : fmtInt(h.height) }}</td>
                <td class="r">{{ h.lag == null ? '—' : h.lag <= 0 ? (h.lag === 0 ? '0' : `${-h.lag} ahead`) : fmtInt(h.lag) }}</td>
                <td class="r">{{ h.count }}</td>
                <td><StatusBadge :status="h.status" /></td>
                <td><span v-if="stallOf(h.height)" class="stall" :title="stallOf(h.height)!.detail">{{ stallOf(h.height)!.label }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <BreakdownPie v-else-if="view === 'pie'" :key="`pie-${tab}`" :rows="rows" :total="total" :label-for="pieLabel" :impl-for="pieImpl" />
        <BreakdownTable v-else :key="tab" :rows="rows" :total="total" :heading="heading" :limit="20">
          <template #label="{ row }">
            <template v-if="tab === 'country'">
              <span class="flag" aria-hidden="true">{{ flag(row.key) }}</span>
              <NuxtLink :to="withSnap({ country: row.key })">{{ countryName(row.key) }}</NuxtLink>
              <span class="muted small mono cc">{{ row.key }}</span>
            </template>
            <template v-else-if="tab === 'net'">
              <NuxtLink :to="withSnap({ provider: row.key })" :title="row.title" class="plain">{{ row.key }}</NuxtLink>
            </template>
            <template v-else-if="tab === 'addr'">{{ NET_LABEL[row.key] ?? row.key }}</template>
            <template v-else-if="tab === 'ua'">
              <NuxtLink class="mono plain" :to="withSnap({ ua_base: row.key })">{{ row.key }}</NuxtLink>
              <ReleaseBadge v-bind="uaRelease(row.key)" />
            </template>
            <template v-else-if="tab === 'version'">{{ row.key }}<ReleaseBadge v-bind="versionRelease(row)" /></template>
            <template v-else>{{ row.key }}</template>
          </template>
        </BreakdownTable>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overview { display: grid; gap: 20px; }
.hero { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 20px; align-items: stretch; }
.hero-main { padding: 6px 0; display: flex; flex-direction: column; }
.count { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; margin: 6px 0 8px; }
.count .n { font-size: clamp(3.4rem, 9vw, 5.6rem); font-weight: 700; letter-spacing: -0.04em; line-height: 0.95; }
.count .unit { font-size: 1.25rem; font-weight: 500; color: var(--ink-2); }
.meta { margin: 0; color: var(--ink-2); display: flex; flex-wrap: wrap; gap: 0 6px; }
.archive-note { margin: 10px 0 0; padding: 8px 12px; background: var(--accent-wash); border-radius: var(--radius); font-size: 0.9rem; }
.jump { margin-top: auto; padding-top: 20px; display: flex; gap: 18px; flex-wrap: wrap; font-weight: 550; }
.jump a { text-decoration: none; }
.statlist { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 6px; }
.statlist li { display: grid; grid-template-columns: 16px 1fr auto 3.2em; align-items: center; gap: 8px; }
.statlist .sv { font-weight: 650; text-align: right; }
.statlist .sp { text-align: right; }
.note { margin: 14px 0 0; line-height: 1.45; }
.impl .table-scroll { margin-top: 14px; }
.impl-table td:first-child { white-space: nowrap; }
.impl-table .swatch { margin-right: 6px; }
.attip { display: grid; grid-template-columns: 5.5em minmax(60px, 160px) auto; align-items: center; gap: 10px; }
.stalled-note { display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--critical-ink); font-weight: 600; white-space: nowrap; }
tr.allstalled td:first-child { color: var(--ink-2); }
.tabs-row { display: flex; align-items: flex-end; gap: 12px; border-bottom: 1px solid var(--rule); margin: -4px 0 12px; }
.tabs { display: flex; gap: 4px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; flex: 1; margin-bottom: -1px; }
.tabs::-webkit-scrollbar { display: none; }
.view-toggle { flex: none; margin-bottom: 6px; }
.tabs button {
  font: inherit; font-size: 0.9rem; background: none; border: 0; color: var(--ink-2); cursor: pointer;
  padding: 8px 12px; border-bottom: 2px solid transparent; white-space: nowrap;
}
.tabs button[aria-selected='true'] { color: var(--ink); border-bottom-color: var(--ink); font-weight: 600; }
.plain { color: var(--ink); text-decoration: none; }
.plain:hover { text-decoration: underline; }
.flag { display: inline-block; width: 1.5em; font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; }
@media (max-width: 560px) {
  .hide-sm { display: none; }
  .impl-table .attip { grid-template-columns: 1fr; gap: 4px; }
  .impl-table td:first-child { white-space: normal; }
}
@media (max-width: 820px) {
  .hero { grid-template-columns: 1fr; }
  .attip { grid-template-columns: 5.5em minmax(50px, 1fr); }
  .stalled-note { grid-column: 1 / -1; }
}
.tiph { display: inline-flex; align-items: center; gap: 4px; }
.cc { margin-left: 6px; }
.stall { font-size: 0.85rem; color: var(--ink-2); }
</style>
