// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  typescript: { strict: true },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'BCH node map — Bitcoin Cash network explorer',
      titleTemplate: '%s · BCH node map',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light dark' },
        {
          name: 'description',
          content: 'Reachable Bitcoin Cash (BCH) full nodes: count, implementations, versions, countries and hosting, crawled every 10 minutes.',
        },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      script: [
        {
          // Resolve the theme before first paint so there is no flash of the wrong one:
          // the stored choice (see app/composables/useTheme.ts), else the OS preference.
          innerHTML:
            "try{var s=localStorage.getItem('darkMode');document.documentElement.dataset.theme=s==='true'?'dark':s==='false'?'light':matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}",
          tagPriority: 'critical',
        },
      ],
    },
  },
  // Plain Node server output (node .output/server/index.mjs); no host-specific preset.
  nitro: { preset: 'node-server' },
  vite: {
    optimizeDeps: { include: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers', 'vue-echarts', 'd3-geo', 'topojson-client'] },
  },
})
