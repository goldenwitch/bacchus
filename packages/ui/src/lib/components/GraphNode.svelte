<script lang="ts">
  import type { SimNode } from '../types.js';
  import { STATUS_MAP } from '../status.js';
  import { playPop, playHover } from '../sound.js';

  let { node, focused, dimmed, visible = true, onfocus, onhoverstart, onhoverend }: { node: SimNode; focused: boolean; dimmed: boolean; visible?: boolean; onfocus: (id: string) => void; onhoverstart: (id: string, event: MouseEvent) => void; onhoverend: () => void } = $props();

  const statusInfo = $derived(STATUS_MAP[node.task.status]);

  // Radius: base 40, scale by shortName length. Clamp 30–60.
  const radius = $derived(Math.min(60, Math.max(30, 20 + node.task.shortName.length * 2)));

  const opacity = $derived(dimmed ? 0.3 : 1.0);

  const filterId = $derived(`glow-${node.id}`);

  // Scale animation state
  let nodeScale = $state(visible ? 1 : 0);

  // React to visible prop changes (entry animation: scale 0 → 1)
  $effect(() => {
    if (visible) {
      nodeScale = 1;
    }
  });

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    onfocus(node.id);
    playPop();
    // Squish sequence: 0.9 → 1.1 → 1.0
    nodeScale = 0.9;
    setTimeout(() => { nodeScale = 1.1; }, 80);
    setTimeout(() => { nodeScale = 1.0; }, 200);
  }

  function handleMouseEnter(event: MouseEvent) {
    onhoverstart(node.id, event);
    playHover();
    nodeScale = 1.08;
  }

  function handleMouseLeave() {
    onhoverend();
    nodeScale = 1;
  }
</script>

<g
  transform="translate({node.x ?? 0}, {node.y ?? 0})"
  opacity={opacity}
  class={statusInfo.cssClass}
  style="cursor: pointer;"
  onclick={handleClick}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <g style="transform: scale({nodeScale}); transform-origin: 0px 0px; transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);">
    <!-- SVG filter for outer glow -->
    <defs>
      <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
      </filter>
    </defs>

    <!-- Outer glow ring -->
    <circle
      r={radius + 6}
      fill="none"
      stroke={statusInfo.color}
      stroke-width="2.5"
      filter="url(#{filterId})"
      opacity="0.6"
      class={node.task.status === 'started' ? 'anim-glow-pulse' : ''}
    />

    <!-- Inner fill circle -->
    <circle
      r={radius}
      fill={statusInfo.darkColor}
      stroke={statusInfo.color}
      stroke-width="1.5"
      class={node.task.status === 'complete' ? 'anim-completion-shimmer' : ''}
    />

    <!-- Emoji badge — top-right quadrant -->
    <text
      x={radius * 0.5}
      y={-radius * 0.4}
      font-size="16"
      text-anchor="middle"
      dominant-baseline="central"
      style="pointer-events: none;"
    >{statusInfo.emoji}</text>

    <!-- Floating label -->
    <text
      y="4"
      fill="#e2e8f0"
      font-size="12"
      text-anchor="middle"
      dominant-baseline="central"
      class="anim-label-bob"
      style="pointer-events: none;"
    >{node.task.shortName}</text>
  </g>
</g>
