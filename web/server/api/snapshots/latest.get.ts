export default defineEventHandler(async (event) => {
  const snap = await resolveSnapshot('latest', network(event))
  setHeader(event, 'cache-control', 'no-cache')
  return snapshotSummary(snap)
})
