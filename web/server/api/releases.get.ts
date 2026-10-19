export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return getReleases()
})
