<script lang="ts">
  let { onload }: { onload: (text: string) => void } = $props();
  let dragover = $state(false);
  let fileInput: HTMLInputElement | undefined = $state(undefined);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onload(reader.result);
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
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={() => { dragover = false; }}
  role="button"
  tabindex="0"
>
  <p>Drop a <code>.vine</code> file here</p>
  <span class="separator">or</span>
  <button onclick={handleBrowse}>Browse</button>
  <input bind:this={fileInput} type="file" accept=".vine,.txt" onchange={handleFileChange} hidden />
</div>

<style>
  .dropzone {
    border: 2px dashed #475569;
    border-radius: 12px;
    padding: 40px 32px;
    text-align: center;
    transition: border-color 200ms, background 200ms;
    color: #94a3b8;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .dropzone.dragover {
    border-color: #4ade80;
    background: rgba(74, 222, 128, 0.05);
  }

  p {
    margin: 0;
    font-size: 1rem;
  }

  code {
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.05);
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
    border: 1px solid #4ade80;
    border-radius: 8px;
    background: transparent;
    color: #4ade80;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 150ms, color 150ms;
  }

  button:hover {
    background: #4ade80;
    color: #0f172a;
  }
</style>
