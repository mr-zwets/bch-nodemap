/** Shared clock for relative times, ticked by the live-refresh plugin. */
export const useNow = () => useState('now', () => Date.now())
