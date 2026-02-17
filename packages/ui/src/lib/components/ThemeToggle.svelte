<script lang="ts">
  import { refreshStatusColors } from '../status.js';

  // Read initial theme from localStorage or default to 'dark'
  let theme = $state<'dark' | 'light'>(
    typeof localStorage !== 'undefined'
      ? ((localStorage.getItem('bacchus-theme') as 'dark' | 'light') ?? 'dark')
      : 'dark',
  );

  function toggle() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bacchus-theme', theme);
    // Sync STATUS_MAP colors from the newly-active CSS custom properties
    refreshStatusColors();
  }

  // Apply theme on mount
  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    refreshStatusColors();
  });
</script>

<button
  class="theme-toggle"
  onclick={toggle}
  aria-label="Toggle {theme === 'dark' ? 'light' : 'dark'} theme"
  title="Switch to {theme === 'dark' ? 'light' : 'dark'} mode"
>
  {#if theme === 'dark'}
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5" />
      <line
        x1="8"
        y1="1"
        x2="8"
        y2="3"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <line
        x1="8"
        y1="13"
        x2="8"
        y2="15"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <line
        x1="1"
        y1="8"
        x2="3"
        y2="8"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <line
        x1="13"
        y1="8"
        x2="15"
        y2="8"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <line
        x1="3.05"
        y1="3.05"
        x2="4.46"
        y2="4.46"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <line
        x1="11.54"
        y1="11.54"
        x2="12.95"
        y2="12.95"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <line
        x1="3.05"
        y1="12.95"
        x2="4.46"
        y2="11.54"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <line
        x1="11.54"
        y1="4.46"
        x2="12.95"
        y2="3.05"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  {:else}
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13.5 10.07A6 6 0 015.93 2.5 6 6 0 1013.5 10.07z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  {/if}
</button>

<style>
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    transition:
      color 150ms,
      background 150ms;
  }

  .theme-toggle:hover {
    color: var(--text-primary);
    background: var(--hover-bg-strong);
  }
</style>
