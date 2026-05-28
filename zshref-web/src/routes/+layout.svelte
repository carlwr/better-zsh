<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="shell">
  <header>
    <a class="brand" href="/">
      <span class="logo">zshref</span>
      <span class="tagline">offline static zsh reference</span>
    </a>
    <ThemeToggle />
  </header>
  <main>
    {@render children()}
  </main>
  <footer>
    <span>powered by local <code>BAAI/bge-small-en-v1.5</code> embeddings</span>
  </footer>
</div>

<style>
  .shell {
    max-width: var(--maxw);
    margin: 0 auto;
    padding: 0 var(--pad);
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 1.5rem 0 1rem;
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    color: inherit;
  }
  .brand:hover { text-decoration: none; }
  .logo {
    font-family: var(--font-mono);
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--accent);
  }
  .tagline {
    font-size: 0.85rem;
    color: var(--fg-mute);
  }
  main {
    flex: 1;
    padding: 1.5rem 0;
  }
  footer {
    padding: 1rem 0;
    border-top: 1px solid var(--border);
    color: var(--fg-mute);
    font-size: 0.85rem;
    text-align: center;
  }
  @media (max-width: 480px) {
    .tagline { display: none; }
  }
</style>
