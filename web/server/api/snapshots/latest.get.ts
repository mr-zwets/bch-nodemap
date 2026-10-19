export default defineEventHandler(async (event) => {
  const snap = await resolveSnapshot('latest', network(event))
  setHeader(event, 'cache-control', 'public, max-age=60')
  return snapshotSummary(snap)
})
