import type { EChartsOption, LineSeriesOption } from 'echarts'
import type { HistoryResponse } from '#shared/types/api'

export type ThemeVars = Record<string, string>

export const UPGRADES = [
  { t: '2021-05-15T12:00:00Z', label: 'May 2021 upgrade' },
  { t: '2022-05-15T12:00:00Z', label: 'May 2022 upgrade' },
  { t: '2023-05-15T12:00:00Z', label: 'May 2023 upgrade' },
  { t: '2024-05-15T12:00:00Z', label: 'May 2024 upgrade' },
  { t: '2025-05-15T12:00:00Z', label: 'May 2025 upgrade' },
  { t: '2026-05-15T12:00:00Z', label: 'May 2026 upgrade' },
]

const SOURCE_LABEL = { cashnodes: 'cashnodes archive', crawler: 'bch-nodemap crawler' } as const

type Datum = [number, number | null] | { value: [number, number | null]; symbol: string; symbolSize: number }

/**
 * [time, value] pairs with a null inserted inside every gap so lines break
 * instead of interpolating. A point with no neighbour on either side (e.g. the
 * first crawler snapshot after the archive gap) would draw nothing as a line,
 * so it gets a visible dot.
 */
export function withBreaks(h: HistoryResponse, values: Array<number | null>): Datum[] {
  const out: Array<[number, number | null]> = []
  const gapStarts = new Map(h.gaps.map((g) => [g.from, g.to]))
  h.points.forEach((p, i) => {
    const t = Date.parse(p.t)
    out.push([t, values[i] ?? null])
    const to = gapStarts.get(p.t)
    if (to) out.push([(t + Date.parse(to)) / 2, null])
  })
  return out.map((d, i) => {
    const isolated = d[1] != null && (out[i - 1]?.[1] ?? null) == null && (out[i + 1]?.[1] ?? null) == null
    return isolated ? { value: d, symbol: 'circle', symbolSize: 7 } : d
  })
}

/** Legend entries: every real series (not the annotation carrier). */
export function legendFor(o: EChartsOption): EChartsOption['legend'] {
  const names = (o.series as LineSeriesOption[]).map((s) => String(s.name)).filter((n) => !n.startsWith('__'))
  return { ...(o.legend as object), data: names }
}

/** Base option: axes, grid, tooltip styling and the source / gap / upgrade annotations. */
export function baseOption(h: HistoryResponse, v: ThemeVars, yName: string, yMax?: number): EChartsOption {
  return {
    animation: false,
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: v['--ink-2'] },
    grid: { left: 8, right: 16, top: 56, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: v['--surface'],
      borderColor: v['--rule-strong'],
      textStyle: { color: v['--ink'], fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: v['--ink-3'], width: 1 } },
      confine: true,
    },
    legend: { top: 0, left: 0, type: 'scroll', icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: v['--ink-2'] }, pageTextStyle: { color: v['--ink-2'] } },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: v['--rule-strong'] } },
      axisTick: { show: false },
      axisLabel: { color: v['--ink-3'], hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: yName,
      nameTextStyle: { color: v['--ink-3'], align: 'left' },
      max: yMax,
      min: 0,
      axisLabel: { color: v['--ink-3'] },
      splitLine: { lineStyle: { color: v['--rule'] } },
    },
  }
}

/** Invisible carrier series holding the shared annotations (gaps, source runs, upgrades). */
export function annotations(h: HistoryResponse, v: ThemeVars): LineSeriesOption {
  const lo = h.points.length ? Date.parse(h.points[0]!.t) : 0
  const hi = h.points.length ? Date.parse(h.points[h.points.length - 1]!.t) : 0
  const sourceStarts = h.sources.map((s) => ({
    xAxis: Date.parse(s.from),
    label: { formatter: SOURCE_LABEL[s.source], position: 'insideEndTop' as const, color: v['--ink-2'], fontSize: 11 },
    lineStyle: { color: v['--ink-3'], type: 'solid' as const, width: 1 },
  }))
  const upgrades = UPGRADES.filter((u) => Date.parse(u.t) >= lo && Date.parse(u.t) <= hi).map((u) => ({
    xAxis: Date.parse(u.t),
    label: { formatter: u.label.replace(' upgrade', ''), position: 'insideEndBottom' as const, color: v['--ink-3'], fontSize: 10 },
    lineStyle: { color: v['--rule-strong'], type: 'solid' as const, width: 1 },
  }))
  return {
    name: '__annotations',
    type: 'line',
    data: [],
    silent: true,
    tooltip: { show: false },
    markArea: {
      silent: true,
      itemStyle: { color: v['--surface-2'], opacity: 0.9 },
      label: { color: v['--ink-3'], fontSize: 11, position: 'inside' },
      data: h.gaps.map((g) => [
        { xAxis: Date.parse(g.from), name: `No data\n${fmtDate(g.from)} → ${fmtDate(g.to)}` },
        { xAxis: Date.parse(g.to) },
      ]),
    },
    markLine: { silent: true, symbol: 'none', data: [...sourceStarts.slice(1), ...upgrades] },
  }
}
