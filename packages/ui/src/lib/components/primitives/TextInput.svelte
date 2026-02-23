<script lang="ts">
  let {
    type = 'text',
    placeholder = '',
    value = $bindable(''),
    onsubmit,
    ariaLabel,
    variant = 'default',
  }: {
    type?: 'text' | 'password';
    placeholder?: string;
    value?: string;
    onsubmit?: () => void;
    ariaLabel?: string;
    variant?: 'default' | 'compact';
  } = $props();
</script>

<input
  {type}
  class="panel-text-input"
  class:panel-text-input-compact={variant === 'compact'}
  {placeholder}
  bind:value
  onkeydown={(e) => {
    if (e.key === 'Enter' && onsubmit) {
      e.preventDefault();
      onsubmit();
    }
  }}
  aria-label={ariaLabel}
/>

<style>
  .panel-text-input {
    flex: 1;
    font-size: 0.85rem;
    padding: 8px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-family: inherit;
    outline: none;
  }
  .panel-text-input:focus {
    border-color: var(--accent-green);
  }
  .panel-text-input::placeholder {
    color: var(--text-dimmed);
  }
  .panel-text-input-compact {
    font-size: 0.72rem;
    padding: 4px 6px;
    border-radius: 6px;
    background: transparent;
  }
</style>
