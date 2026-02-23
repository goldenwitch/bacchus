<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    width = '230px',
    children,
  }: {
    width?: string;
    children: Snippet;
  } = $props();
</script>

<div class="panel-body" style:width={width}>
  {@render children()}
</div>

<style>
  .panel-body {
    max-height: calc(100vh - 180px);
    overflow-y: auto;
    padding: 0 12px 10px;
    scrollbar-width: thin;
    scrollbar-color: var(--border-subtle) transparent;
  }
  .panel-body::-webkit-scrollbar {
    width: 5px;
  }
  .panel-body::-webkit-scrollbar-track {
    background: transparent;
  }
  .panel-body::-webkit-scrollbar-thumb {
    background: var(--border-subtle);
    border-radius: 4px;
  }
</style>
