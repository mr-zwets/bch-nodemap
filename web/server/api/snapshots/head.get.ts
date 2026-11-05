/** Id and time of the newest snapshot; polled by the client to know when to refetch. */
export default defineEventHandler(async (event) => {
  const snap = await latestSnapshot(network(event))
  setHeader(event, 'cache-control', 'no-store')
  return { id: snap?.id ?? null, takenAt: snap?.takenAt ?? null }
})
