<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import {
    PHYSICS_SLIDER_DEFS,
    type PhysicsConfig,
    type PhysicsParamKey,
  } from '../physics.js';
  import PanelSlider from './primitives/PanelSlider.svelte';
  import GroupHeader from './primitives/GroupHeader.svelte';
  import ResetButton from './primitives/ResetButton.svelte';
  import PanelBody from './primitives/PanelBody.svelte';
  import PanelCheckbox from './primitives/PanelCheckbox.svelte';

  let {
    config,
    onchange,
    onreset,
    showStrataLines = false,
    ontogglestrata,
  }: {
    config: PhysicsConfig;
    onchange: (key: PhysicsParamKey, value: number) => void;
    onreset: () => void;
    showStrataLines?: boolean;
    ontogglestrata?: (show: boolean) => void;
  } = $props();

  const groups = $derived.by(() => {
    const seen = new SvelteSet<string>();
    const result: string[] = [];
    for (const def of PHYSICS_SLIDER_DEFS) {
      if (!seen.has(def.group)) {
        seen.add(def.group);
        result.push(def.group);
      }
    }
    return result;
  });

  function formatValue(
    key: PhysicsParamKey,
    value: number,
    step: number,
  ): string {
    const precision = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    if (key === 'chargeStrength') {
      return '-' + Math.abs(value).toFixed(precision);
    }
    return value.toFixed(precision);
  }
</script>

<PanelBody>
  {#each groups as group (group)}
    <GroupHeader label={group} />
    {#each PHYSICS_SLIDER_DEFS.filter((d) => d.group === group) as def (def.key)}
      <PanelSlider
        label={def.label}
        value={config[def.key]}
        min={def.min}
        max={def.max}
        step={def.step}
        formatFn={(v) => formatValue(def.key, v, def.step)}
        onchange={(v) => onchange(def.key, v)}
      />
    {/each}
  {/each}

  <PanelCheckbox
    checked={showStrataLines}
    label="Strata Lines"
    onchange={(checked) => ontogglestrata?.(checked)}
    ariaLabel="Show strata lines"
  />

  <ResetButton onclick={onreset} />
</PanelBody>
