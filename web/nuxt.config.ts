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
          content: 'Reachable Bitcoin Cash (BCH) full nodes: count, implementations, versions, countries, hosting and history since 2020.',
        },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  // Plain Node server output (node .output/server/index.mjs); no host-specific preset.
  nitro: { preset: 'node-server' },
  vite: {
    optimizeDeps: { include: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers', 'vue-echarts', 'd3-geo', 'topojson-client'] },
  },
})
