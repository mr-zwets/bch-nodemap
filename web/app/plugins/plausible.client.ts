// Plausible web analytics: a pageview per page, sent by the app itself through
// Plausible's Events API rather than its tracker script, so no third-party code
// runs on the page and nothing is loaded from plausible.io.
// API: https://plausible.io/docs/events-api
// Only on the public site: copies of this repo, the local Tauri app and dev
// servers send nothing.
const SITE = 'nodemap.cash'

function send(path: string, referrer: string | null) {
  void fetch('https://plausible.io/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      name: 'pageview',
      domain: SITE,
      // origin + path only: filters like ?country=DE would split pages into many rows
      url: location.origin + path,
      referrer,
    }),
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {})
}

export default defineNuxtPlugin((nuxtApp) => {
  if (location.hostname !== SITE) return
  // the tracker's own opt-outs: automated browsers and a device excluded via localStorage
  let optedOut = navigator.webdriver
  try {
    optedOut ||= localStorage.getItem('plausible_ignore') === 'true'
  } catch {
    // storage unavailable, nothing to read
  }
  if (optedOut) return

  // The referring site's origin, sent with the landing pageview only; page changes
  // inside the app have no external referrer.
  const referrer = document.referrer && new URL(document.referrer).origin !== location.origin
    ? new URL(document.referrer).origin
    : null
  nuxtApp.hook('app:mounted', () => send(location.pathname, referrer))
  // Client-side navigation (Overview, Map, Nodes): one pageview per path change,
  // not for query-only changes like switching a filter.
  useRouter().afterEach((to, from) => {
    if (from.matched.length && to.path !== from.path) send(to.path, null)
  })
})
