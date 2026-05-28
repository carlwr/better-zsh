// Light/dark theme toggle. Pre-paint application happens in app.html so the
// page never renders the wrong theme; this module only handles user toggles.

import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'zshref-theme';

function initial(): Theme {
  if (!browser) return 'dark';
  // app.html's pre-paint script already resolved + applied the theme before the
  // bundle loaded; adopt that applied value so the store can't disagree with
  // what's painted (a split flashes the wrong toggle icon/label). Recompute
  // only if the attribute is somehow absent.
  const applied = document.documentElement.getAttribute('data-theme');
  if (applied === 'light' || applied === 'dark') return applied;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export const theme = writable<Theme>(initial());

if (browser) {
  theme.subscribe((t) => {
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // private mode etc.; toggle still works for this session.
    }
  });
}

export function toggleTheme(): void {
  theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
}
