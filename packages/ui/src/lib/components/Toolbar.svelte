<script lang="ts">
  import MuteButton from './MuteButton.svelte';
</script>

<div class="toolbar">
  <MuteButton />
</div>

<style>
  .toolbar {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 150;
    display: flex;
    gap: 8px;
    align-items: center;
  }
</style>
