/** true after hydration; use to render client-relative things (e.g. "3 min ago") without hydration mismatches. */
export function useMounted() {
  const mounted = ref(false)
  onMounted(() => (mounted.value = true))
  return mounted
}
