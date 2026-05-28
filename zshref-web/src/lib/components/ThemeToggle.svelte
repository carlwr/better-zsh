<script lang="ts">
  import { theme, toggleTheme } from '$lib/theme';
</script>

<button
  type="button"
  onclick={toggleTheme}
  title={$theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
  aria-label={$theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
>
  {$theme === 'dark' ? '☀' : '☾'}
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
  }
</style>
