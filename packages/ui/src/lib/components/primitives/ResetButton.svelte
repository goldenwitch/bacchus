<script lang="ts">
  let {
    label = 'Reset Defaults',
    onclick,
  }: {
    label?: string;
    onclick: () => void;
  } = $props();
</script>

<button type="button" class="panel-reset" {onclick}>{label}</button>

<style>
  .panel-reset {
    width: 100%;
    font-size: 0.78rem;
    padding: 6px 0;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    margin-top: 8px;
  }
  .panel-reset:hover {
    background: var(--hover-bg);
  }
</style>
