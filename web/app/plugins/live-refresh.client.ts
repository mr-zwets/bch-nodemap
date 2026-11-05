// Keeps an open window current (the Tauri app never reloads its page): checks for a
// new snapshot every minute and when the window comes back into view, and refetches
// every useFetch on the page when one has landed. Also ticks the shared `now` so
// relative times ("3 min ago") keep moving between crawls.
const POLL_MS = 60_000

export default defineNuxtPlugin(() => {
  const now = useNow()
  let lastId: number | null | undefined
  let busy = false

  async function check() {
    now.value = Date.now()
    if (busy || document.hidden) return
    busy = true
    try {
      const { id } = await $fetch<{ id: number | null }>('/api/snapshots/head')
      if (lastId !== undefined && id !== lastId) await refreshNuxtData()
      lastId = id
    } catch {
      // server restarting or db down; try again next tick
    } finally {
      busy = false
    }
  }

  // The first check only records the current id: the page was rendered moments ago.
  onNuxtReady(() => {
    check()
    setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', () => document.hidden || check())
  })
})
