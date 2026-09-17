// Light/dark theme toggle. app.html applies the persisted or system theme
// before first paint; this module adopts what is painted — so the store can
// never disagree with the page — and persists the user's toggles, and only
// those: an untoggled visit keeps following the system preference.

import { get, writable } from "svelte/store"
import { browser } from "$app/environment"

export type Theme = "light" | "dark"

/** Also read by app.html's pre-paint script, by hand; a test pins the two. */
export const STORAGE_KEY = "zshref-theme"

const painted = (): Theme =>
  browser && document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark"

export const theme = writable<Theme>(painted())

if (browser) {
  theme.subscribe(t => document.documentElement.setAttribute("data-theme", t))
}

export function toggleTheme(): void {
  const next: Theme = get(theme) === "dark" ? "light" : "dark"
  theme.set(next)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // private mode etc.; the toggle still holds for this session.
  }
}
