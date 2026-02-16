<script lang="ts">
  let { onload }: { onload: (text: string) => void } = $props();
  let dragover = $state(false);
  let fileInput: HTMLInputElement | undefined = $state(undefined);
  let success = $state(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        success = true;
        setTimeout(() => {
          onload(reader.result as string);
        }, 500);
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragover = false;
    const file = event.dataTransfer?.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragover = true;
  }

  function handleBrowse() {
    fileInput?.click();
  }

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handleFile(file);
  }
</script>

<div
  class="dropzone"
  class:dragover
  class:success
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={() => {
    dragover = false;
  }}
  onkeydown={(e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleBrowse();
    }
  }}
  role="button"
  tabindex="0"
>
  {#if success}
    <span class="check-icon">✓</span>
    <p class="success-text">File loaded!</p>
  {:else}
    <p>Drop a <code>.vine</code> file here</p>
    <span class="separator">or</span>
    <button onclick={handleBrowse}>Browse</button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".vine,.txt"
      onchange={handleFileChange}
      hidden
    />
  {/if}
</div>

<style>
  .dropzone {
    border: 2px dashed var(--disabled-bg);
    border-radius: 12px;
    padding: 40px 32px;
    text-align: center;
    transition:
      border-color 200ms,
      background 200ms;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .dropzone.dragover {
    border-color: var(--accent-green);
    background: var(--color-accent-subtle);
  }

  .dropzone.success {
    border-color: var(--accent-green);
    background: var(--color-accent-hover);
  }

  .dropzone:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .check-icon {
    font-size: 2.5rem;
    color: var(--accent-green);
    animation: pop-in 300ms ease-out;
  }

  .success-text {
    color: var(--accent-green);
    font-weight: 600;
  }

  @keyframes pop-in {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    60% {
      transform: scale(1.3);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  p {
    margin: 0;
    font-size: 1rem;
  }

  code {
    color: var(--text-secondary);
    background: var(--color-code-bg);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
  }

  .separator {
    font-size: 0.85rem;
    opacity: 0.6;
  }

  button {
    padding: 8px 24px;
    border: 1px solid var(--accent-green);
    border-radius: 8px;
    background: transparent;
    color: var(--accent-green);
    font-size: 0.9rem;
    cursor: pointer;
    transition:
      background 150ms,
      color 150ms;
  }

  button:hover {
    background: var(--accent-green);
    color: var(--accent-green-dark);
  }
</style>
