<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<div class="panel-group-header">{label}</div>

<style>
  .panel-group-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dimmed);
    margin-top: 10px;
    margin-bottom: 4px;
  }
</style>
