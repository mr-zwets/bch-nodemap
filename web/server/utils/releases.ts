import { normaliseVersion, type Release, type ReleaseMap } from '#shared/utils/release'

interface Source {
  impl: string
  url: string
  /** extract [tag, releasedAt, htmlUrl] of the newest stable release */
  pick: (json: any) => [string, string | null, string] | null
}

const gitlab = (project: string, filter: (tag: string) => boolean = () => true): Pick<Source, 'url' | 'pick'> => ({
  url: `https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}/releases?per_page=20`,
  pick: (rels: any[]) => {
    const r = rels.find((x) => !x.upcoming_release && filter(x.tag_name))
    return r ? [r.tag_name, r.released_at ?? null, r._links?.self ?? `https://gitlab.com/${project}/-/releases`] : null
  },
})

const github = (repo: string): Pick<Source, 'url' | 'pick'> => ({
  url: `https://api.github.com/repos/${repo}/releases/latest`,
  pick: (r: any) => (r?.tag_name ? [r.tag_name, r.published_at ?? null, r.html_url] : null),
})

const SOURCES: Source[] = [
  { impl: 'Bitcoin Cash Node', ...gitlab('bitcoin-cash-node/bitcoin-cash-node', (t) => /^v\d+\.\d+\.\d+$/.test(t)) },
  { impl: 'BCH Unlimited', ...gitlab('bitcoinunlimited/BCHUnlimited') },
  { impl: 'BCHD', ...github('gcash/bchd') },
]

/** Newest official release per implementation; cached 6h, failures are skipped. */
export const getReleases = defineCachedFunction(
  async (): Promise<ReleaseMap> => {
    const out: ReleaseMap = {}
    await Promise.all(
      SOURCES.map(async (s) => {
        try {
          const json = await $fetch(s.url, { timeout: 10_000, headers: { 'user-agent': 'bch-nodemap' } })
          const picked = s.pick(json)
          if (!picked) return
          const [tag, releasedAt, url] = picked
          out[s.impl] = { version: normaliseVersion(tag), tag, releasedAt, url } satisfies Release
        } catch (err) {
          console.warn(`[releases] ${s.impl}: ${(err as Error).message}`)
        }
      }),
    )
    return out
  },
  { name: 'releases', maxAge: 6 * 60 * 60, swr: true },
)
