/**
 * Light/dark theme, same model as the Cashonize landing page: the visitor's
 * choice is kept in localStorage ("darkMode": "true" | "false"), otherwise the
 * OS preference is followed live. The resolved theme lives in
 * <html data-theme>, set before first paint by the inline script in
 * nuxt.config.ts; main.css keys its colours off that attribute.
 */
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'darkMode'

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'true' ? 'dark' : v === 'false' ? 'light' : null
  } catch {
    return null // private mode / blocked storage
  }
}

const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
}

let followingSystem = false

export function useTheme() {
  // Shared across components; resolved on the client (the server can't know).
  const theme = useState<Theme | null>('theme', () => null)

  if (import.meta.client) {
    if (!theme.value) theme.value = (document.documentElement.dataset.theme as Theme) || storedTheme() || systemTheme()
    if (!followingSystem) {
      followingSystem = true
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (storedTheme()) return // the visitor picked a side
        theme.value = e.matches ? 'dark' : 'light'
        applyTheme(theme.value)
      })
    }
  }

  function setTheme(t: Theme) {
    theme.value = t
    applyTheme(t)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t === 'dark' ? 'true' : 'false')
    } catch {
      // preference just won't persist
    }
  }
  const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark')

  return { theme: readonly(theme), setTheme, toggleTheme }
}
