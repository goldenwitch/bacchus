<script lang="ts">
  let { onload, onerror }: { onload: (text: string) => void; onerror: (message: string) => void } = $props();
  let url = $state('');
  let loading = $state(false);

  async function loadUrl() {
    if (!url.trim()) return;
    loading = true;
    try {
      const response = await fetch(url.trim());
      if (!response.ok) {
        onerror(`Failed to load file: ${response.status} ${response.statusText}`);
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
    placeholder="https://example.com/project.vine"
    onkeydown={handleKeydown}
    disabled={loading}
  />
  <button onclick={loadUrl} disabled={loading || !url.trim()}>
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
    border: 1px solid #334155;
    border-radius: 8px;
    background: #1e293b;
    color: #e2e8f0;
    font-size: 0.9rem;
    outline: none;
    transition: border-color 150ms;
  }

  input::placeholder {
    color: #64748b;
  }

  input:focus {
    border-color: #4ade80;
  }

  input:disabled {
    opacity: 0.5;
  }

  button {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: #4ade80;
    color: #0f172a;
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
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
