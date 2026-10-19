import type { ReleaseMap } from '#shared/utils/release'

/** Newest official release per implementation, fetched once per page load. */
export function useReleases() {
  const { data } = useFetch<ReleaseMap>('/api/releases', { key: 'releases', default: () => ({}) })
  return data
}
