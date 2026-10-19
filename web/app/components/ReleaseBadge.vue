<script setup lang="ts">
/** Version pill: "latest" / "dev" (from official release feeds) or "out of consensus". */
const props = defineProps<{ impl: string; version: string }>()
const releases = useReleases()
const tag = computed(() => releaseTag(props.impl, props.version, releases.value))
const rel = computed(() => releases.value?.[props.impl])
const label = computed(() => (tag.value === 'out-of-consensus' ? 'out of consensus' : tag.value))
const title = computed(() => {
  switch (tag.value) {
    case 'latest': return `Newest official release (${rel.value?.tag})`
    case 'dev': return `Newer than the newest official release ${rel.value?.tag}: development or pre-release build`
    case 'out-of-consensus': return outOfConsensus(props.impl, props.version) ?? ''
    default: return ''
  }
})
</script>

<template>
  <span v-if="tag" class="rb" :class="tag" :title="title">{{ label }}</span>
</template>

<style scoped>
.rb {
  display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 999px;
  font-size: 10.5px; font-weight: 600; line-height: 17px; letter-spacing: 0.02em; text-transform: uppercase;
  vertical-align: 1px; white-space: nowrap;
}
.latest { color: var(--good-ink); background: color-mix(in srgb, var(--good) 16%, transparent); }
.dev { color: var(--warning-ink); background: color-mix(in srgb, var(--warning) 16%, transparent); }
.out-of-consensus { color: var(--ink-2); background: color-mix(in srgb, var(--ink-3) 22%, transparent); }
</style>
