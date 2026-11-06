/**
 * Resolved values of CSS custom properties, re-read when the colour scheme
 * changes. Canvas/SVG chart libraries need concrete colours, not var().
 */
export function useThemeVars<K extends string>(names: readonly K[]) {
  const vars = ref({} as Record<K, string>)
  const read = () => {
    const cs = getComputedStyle(document.documentElement)
    const out = {} as Record<K, string>
    for (const n of names) out[n] = cs.getPropertyValue(n).trim()
    vars.value = out
  }
  let mq: MediaQueryList | undefined
  let mo: MutationObserver | undefined
  onMounted(() => {
    read()
    // OS scheme changes, and the theme toggle (which sets <html data-theme>)
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', read)
    mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  })
  onBeforeUnmount(() => {
    mq?.removeEventListener('change', read)
    mo?.disconnect()
  })
  return vars
}
