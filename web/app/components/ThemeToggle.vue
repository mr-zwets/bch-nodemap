<script setup lang="ts">
// Design from the Cashonize landing page: a round chip whose sun and moon
// swap with a little spin. Which glyph shows is driven by <html data-theme>
// (set before first paint), not by component state, so server-rendered HTML
// is right from the start and hydration can't mismatch.
const { theme, toggleTheme } = useTheme()
const mounted = useMounted()
const label = computed(() =>
  !mounted.value ? 'Toggle dark mode' : theme.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
)
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :title="label"
    :aria-label="label"
    :aria-pressed="mounted ? theme === 'dark' : undefined"
    @click="toggleTheme"
  >
    <span class="icon-stack" aria-hidden="true">
      <svg class="icon sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 1.8v2.4M12 19.8v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M1.8 12h2.4M19.8 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7" />
      </svg>
      <svg class="icon moon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.7 14.6A8.7 8.7 0 0 1 9.4 3.3a1 1 0 0 0-1.3-1.2 10.7 10.7 0 1 0 13.8 13.8 1 1 0 0 0-1.2-1.3z" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink-2);
  cursor: pointer;
  transition: transform 0.2s ease, background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
}
.theme-toggle:hover {
  transform: translateY(-1px);
  color: var(--ink);
  border-color: var(--rule-strong);
}
.theme-toggle:active {
  transform: scale(0.94);
}
.theme-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

/* the two glyphs sit on top of each other and swap with a little spin */
.icon-stack {
  position: relative;
  display: block;
  width: 18px;
  height: 18px;
}
.icon {
  position: absolute;
  inset: 0;
  width: 18px;
  height: 18px;
  transition: opacity 0.28s ease, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
/* light: show the moon (click for dark); dark: show the sun */
.sun {
  opacity: 0;
  transform: rotate(-70deg) scale(0.5);
}
.moon {
  opacity: 1;
  transform: rotate(0) scale(1);
}
:root[data-theme='dark'] .sun {
  opacity: 1;
  transform: rotate(0) scale(1);
}
:root[data-theme='dark'] .moon {
  opacity: 0;
  transform: rotate(70deg) scale(0.5);
}

@media (prefers-reduced-motion: reduce) {
  .theme-toggle,
  .icon {
    transition: none;
  }
}
</style>
