<script setup lang="ts" generic="T extends { key: string; count: number }">
/**
 * Donut view of a breakdown: the top slices plus "Other", with an HTML legend
 * (long user agents read better in a list than as chart labels).
 *
 * Colours: with `implFor`, every slice is a shade of its implementation's
 * colour (all BCHN versions orange-ish), so it never contradicts the
 * implementation colours used elsewhere. Without it, shades of the site green.
 */
import type { EChartsOption } from 'echarts'

const props = defineProps<{
  rows: T[]
  total: number
  /** label shown in legend/tooltip; defaults to row.key */
  labelFor?: (row: T) => string
  /** implementation of a row; enables implementation-shade colouring */
  implFor?: (row: T) => string
  slices?: number
}>()

const IMPL_VARS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8', '--impl-bchd'] as const
const v = useThemeVars([...IMPL_VARS, '--s-other', '--rule-strong', '--surface', '--ink'] as const)
const css = (name: string) => (v.value as Record<string, string>)[name] || ''

interface Slice { name: string; value: number; color: string; other?: boolean }

const slices = computed<Slice[]>(() => {
  const max = props.slices ?? 20
  const sorted = [...props.rows].sort((a, b) => b.count - a.count)
  const top = sorted.length > max + 1 ? sorted.slice(0, max) : sorted

  let colors: string[]
  if (props.implFor) {
    // group by implementation, shade within the group by rank
    const groups = new Map<string, number[]>()
    top.forEach((r, i) => {
      const impl = props.implFor!(r)
      groups.set(impl, [...(groups.get(impl) ?? []), i])
    })
    colors = new Array(top.length)
    for (const [impl, idx] of groups) {
      const base = css(implVar(impl)) || NEUTRAL_BASE
      const ramp = shades(base, idx.length)
      idx.forEach((i, k) => (colors[i] = ramp[k]!))
    }
  } else {
    colors = shades(NEUTRAL_BASE, top.length)
  }

  const out: Slice[] = top.map((r, i) => ({ name: props.labelFor?.(r) ?? r.key, value: r.count, color: colors[i]! }))
  const rest = sorted.slice(top.length).reduce((n, r) => n + r.count, 0)
  if (rest > 0) out.push({ name: `Other (${sorted.length - top.length})`, value: rest, color: css('--rule-strong') || '#888', other: true })
  return out
})

const option = computed<EChartsOption>(() => ({
  animation: false,
  tooltip: {
    trigger: 'item',
    backgroundColor: css('--surface'),
    borderColor: css('--rule-strong'),
    textStyle: { color: css('--ink'), fontSize: 12 },
    formatter: (p: any) => `${p.name}<br/><b>${fmtInt(p.value)}</b> nodes · ${p.percent.toFixed(1)}%`,
  },
  series: [
    {
      type: 'pie',
      radius: ['52%', '88%'],
      center: ['50%', '50%'],
      label: { show: false },
      itemStyle: { borderColor: css('--surface'), borderWidth: 2 },
      emphasis: { scale: true, scaleSize: 4 },
      data: slices.value.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
    },
  ],
}))
</script>

<template>
  <div class="pie">
    <div class="chart-wrap">
      <EChart :option="option" :height="260" />
      <div class="center" aria-hidden="true">
        <span class="n">{{ fmtInt(total) }}</span>
        <span class="l">nodes</span>
      </div>
    </div>
    <ul class="legend">
      <li v-for="s in slices" :key="s.name">
        <span class="swatch" :style="{ background: s.color }" />
        <span class="name">{{ s.name }}</span>
        <span class="num">{{ fmtInt(s.value) }}</span>
        <span class="num muted pct">{{ fmtPct(s.value, total) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pie { display: grid; grid-template-columns: minmax(220px, 300px) 1fr; gap: 24px; align-items: center; }
.pie > * { min-width: 0; }
.chart-wrap { position: relative; width: 100%; max-width: 300px; justify-self: center; }
.center { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; pointer-events: none; }
.center .n { font-size: 1.5rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.center .l { font-size: 0.8rem; color: var(--ink-3); }
.legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.legend li { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 4.5em; gap: 10px; align-items: center; font-size: 0.9rem; }
.swatch { width: 12px; height: 12px; border-radius: 3px; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) {
  .pie { grid-template-columns: 1fr; }
}
</style>
