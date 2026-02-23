<script lang="ts">
  let {
    checked,
    label,
    onchange,
    ariaLabel,
  }: {
    checked: boolean;
    label: string;
    onchange: (checked: boolean) => void;
    ariaLabel?: string;
  } = $props();
</script>

<label class="panel-checkbox">
  <input
    type="checkbox"
    {checked}
    onchange={() => onchange(!checked)}
    aria-label={ariaLabel ?? label}
  />
  <span class="panel-checkbox-label">{label}</span>
</label>

<style>
  .panel-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    cursor: pointer;
  }
  .panel-checkbox input[type='checkbox'] {
    accent-color: var(--focus-ring);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }
  .panel-checkbox-label {
    font-size: 0.78rem;
    color: var(--text-secondary);
  }
</style>
