<script lang="ts">
  let {
    sourceX,
    sourceY,
    targetX,
    targetY,
    highlighted = false,
    dimmed = false,
    visible = true,
    color = 'var(--color-edge)',
    sourceId = '',
    targetId = '',
  }: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    highlighted?: boolean;
    dimmed?: boolean;
    visible?: boolean;
    color?: string;
    sourceId?: string;
    targetId?: string;
  } = $props();

  const opacity = $derived(visible ? (highlighted ? 1.0 : dimmed ? 0.15 : 0.6) : 0);

  // Stable marker id per edge instance using source/target IDs
  const markerId = $derived(`arrow-${sourceId || 'src'}-${targetId || 'tgt'}`);

  // Compute a perpendicular offset for the quadratic Bézier control point
  // Vary offset based on edge source+target ID hash to spread overlapping edges
  const offset = $derived(
    sourceId && targetId
      ? ((sourceId.charCodeAt(0) + targetId.charCodeAt(0)) % 3) * 10 + 25
      : 30
  );

  const path = $derived.by(() => {
    const mx = (sourceX + targetX) / 2;
    const my = (sourceY + targetY) / 2;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular direction
    const px = -dy / len * offset;
    const py = dx / len * offset;
    const cx = mx + px;
    const cy = my + py;
    return `M ${sourceX} ${sourceY} Q ${cx} ${cy} ${targetX} ${targetY}`;
  });
</script>

<defs>
  <marker
    id={markerId}
    viewBox="0 0 12 8"
    refX="10"
    refY="4"
    markerWidth="10"
    markerHeight="8"
    orient="auto-start-reverse"
  >
    <path d="M 0 0 L 12 4 L 0 8 z" fill={color} />
  </marker>
</defs>

<path
  d={path}
  fill="none"
  stroke={color}
  stroke-width="2"
  marker-end="url(#{markerId})"
  opacity={opacity}
  stroke-dasharray={highlighted ? '8 4' : dimmed ? '4 6' : 'none'}
  class={highlighted ? 'anim-edge-flow' : ''}
  style="transition: opacity 400ms, stroke 400ms;"
/>
