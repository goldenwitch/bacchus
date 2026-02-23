<script lang="ts">
  let {
    label,
    value,
    min,
    max,
    step,
    formatFn,
    onchange,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    formatFn?: (value: number) => string;
    onchange: (value: number) => void;
  } = $props();

  const formatted = $derived(
    formatFn
      ? formatFn(value)
      : step < 0.01
        ? value.toFixed(3)
        : step < 0.1
          ? value.toFixed(2)
          : step < 1
            ? value.toFixed(1)
            : String(value),
  );
</script>

<div class="panel-slider">
  <div class="panel-slider-row">
    <span class="panel-slider-label">{label}</span>
    <span class="panel-slider-value">{formatted}</span>
  </div>
  <input
    type="range"
    class="panel-slider-range"
    {min}
    {max}
    {step}
    value={value}
    oninput={(e) => onchange(Number(e.currentTarget.value))}
    aria-label={label}
  />
</div>

<style>
  .panel-slider {
    margin-bottom: 6px;
  }
  .panel-slider-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 2px;
  }
  .panel-slider-label {
    font-size: 0.78rem;
    color: var(--text-secondary);
  }
  .panel-slider-value {
    font-size: 0.72rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .panel-slider-range {
    width: 100%;
    accent-color: var(--focus-ring);
    height: 4px;
    cursor: pointer;
  }
</style>
