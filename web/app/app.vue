<template>
  <div class="shell">
    <StatusSprite />
    <header class="top">
      <div class="wrap top-inner">
        <NuxtLink to="/" class="brand" aria-label="bch-nodemap home">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <g fill="none" stroke="var(--surface)" stroke-width="2">
              <circle cx="9" cy="11" r="3" /><circle cx="23" cy="9" r="3" /><circle cx="16" cy="23" r="3" />
              <path d="M11.6 12.4 14 20.4M18.2 21.6l3.6-9.8M12 10.6l8-1.2" />
            </g>
          </svg>
          <span><b>bch</b>-nodemap</span>
        </NuxtLink>
        <nav aria-label="Main">
          <NuxtLink to="/" exact-active-class="on">Overview</NuxtLink>
          <NuxtLink to="/map" active-class="on">Map</NuxtLink>
          <NuxtLink to="/nodes" active-class="on">Nodes</NuxtLink>
          <!-- History hidden until the crawler has built up data; /history still works -->
        </nav>
        <ThemeToggle class="theme" />
      </div>
    </header>
    <main class="wrap main">
      <NuxtPage />
    </main>
    <footer class="wrap foot">
      <p>
        Data: bch-nodemap crawler.
        <a href="https://db-ip.com" rel="noopener">GeoIP by DB-IP</a>
        (<a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener license">CC BY 4.0</a>).
        Open source (MIT) on <a href="https://github.com/mr-zwets/bch-nodemap" rel="noopener">GitHub</a>.
      </p>
      <p class="muted">Reachable = completed a version handshake with our crawler.</p>
    </footer>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: flex; flex-direction: column; }
.top { border-bottom: 1px solid var(--rule); background: var(--surface); }
.top-inner { display: flex; align-items: center; gap: 16px; min-height: 56px; flex-wrap: wrap; }
.top-inner nav { margin-left: auto; }
.brand { display: inline-flex; align-items: center; gap: 9px; color: var(--ink); text-decoration: none; font-size: 1.05rem; letter-spacing: -0.01em; }
.brand b { font-weight: 700; }
nav { display: flex; gap: 2px; overflow-x: auto; }
nav a { color: var(--ink-2); text-decoration: none; padding: 16px 10px 14px; border-bottom: 2px solid transparent; font-size: 0.92rem; white-space: nowrap; }
nav a:hover { color: var(--ink); }
nav a.on { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
nav a:focus-visible { outline: none; color: var(--ink); background: var(--accent-wash); border-radius: 4px 4px 0 0; }
.main { flex: 1; width: 100%; padding-top: 28px; padding-bottom: 40px; }
.foot { width: 100%; border-top: 1px solid var(--rule); padding-top: 16px; padding-bottom: 28px; font-size: 0.82rem; color: var(--ink-2); }
.foot p { margin: 0 0 4px; }
@media (max-width: 560px) {
  .top-inner { padding-top: 8px; }
  /* toggle stays top right next to the brand; the nav wraps to its own row */
  .top-inner .theme { margin-left: auto; }
  .top-inner nav { order: 3; width: 100%; margin-left: 0; }
  nav a { padding: 10px 8px 9px; }
}
</style>
