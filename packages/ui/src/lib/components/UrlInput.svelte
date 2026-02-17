<script lang="ts">
  let {
    onload,
    onerror,
  }: { onload: (text: string) => void; onerror: (message: string) => void } =
    $props();
  let url = $state('');
  let loading = $state(false);

  // Responsive placeholder — shorter on narrow viewports
  const isNarrow =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 480px)').matches
      : false;
  const placeholder = isNarrow
    ? 'Paste URL…'
    : 'https://example.com/project.vine';

  async function loadUrl() {
    if (!url.trim()) return;
    loading = true;
    try {
      const response = await fetch(url.trim());
      if (!response.ok) {
        onerror(
          `Failed to load file: ${response.status} ${response.statusText}`,
        );
        return;
      }
      const text = await response.text();
      onload(text);
    } catch {
      onerror('Network error');
    } finally {
      loading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') loadUrl();
  }
</script>

<div class="url-input">
  <input
    type="text"
    bind:value={url}
    {placeholder}
    onkeydown={handleKeydown}
    disabled={loading}
  />
  <button onclick={loadUrl} disabled={loading || !url.trim()}>
    {#if loading}<span class="spinner"></span>{/if}
    {loading ? 'Loading…' : 'Load'}
  </button>
</div>

<style>
  .url-input {
    display: flex;
    gap: 8px;
  }

  input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.9rem;
    outline: none;
    transition: border-color 150ms;
  }

  input::placeholder {
    color: var(--text-dimmed);
  }

  input:focus {
    border-color: var(--accent-green);
  }

  input:disabled {
    opacity: 0.5;
  }

  button {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: var(--accent-green);
    color: var(--accent-green-dark);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 150ms;
    white-space: nowrap;
  }

  button:hover:not(:disabled) {
    opacity: 0.85;
  }

  button:disabled {
    background: var(--disabled-bg);
    color: var(--bg-primary);
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-spinner-border);
    border-top-color: var(--text-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
