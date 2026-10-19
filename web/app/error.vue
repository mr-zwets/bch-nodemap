<script setup lang="ts">
import type { NuxtError } from '#app'
const props = defineProps<{ error: NuxtError }>()
useHead({ title: props.error.statusCode === 404 ? 'Not found' : 'Error' })
</script>

<template>
  <div class="err wrap">
    <p class="code">{{ error.statusCode }}</p>
    <h1>{{ error.statusCode === 404 ? (error.statusMessage || 'Page not found') : 'Something went wrong' }}</h1>
    <p class="muted">{{ error.statusCode === 404 ? 'There is nothing at this address.' : 'Please try again in a minute.' }}</p>
    <button class="btn" type="button" @click="clearError({ redirect: '/' })">Back to the overview</button>
  </div>
</template>

<style scoped>
.err { padding-top: 12vh; padding-bottom: 12vh; }
.code { font-size: 4rem; font-weight: 700; letter-spacing: -0.04em; margin: 0; color: var(--ink-3); }
h1 { margin: 4px 0 8px; }
</style>
