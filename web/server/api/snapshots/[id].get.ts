export default defineEventHandler(async (event) => {
  const snap = await resolveSnapshot(getRouterParam(event, 'id'), network(event))
  setHeader(event, 'cache-control', 'public, max-age=300')
  return snapshotSummary(snap)
})
