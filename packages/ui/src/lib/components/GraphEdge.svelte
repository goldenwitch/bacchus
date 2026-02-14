<script lang="ts">
  let {
    sourceX,
    sourceY,
    targetX,
    targetY,
    highlighted = false,
    dimmed = false,
    visible = true,
    color = '#475569',
  }: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    highlighted?: boolean;
    dimmed?: boolean;
    visible?: boolean;
    color?: string;
  } = $props();

  const opacity = $derived(visible ? (highlighted ? 1.0 : dimmed ? 0.15 : 0.6) : 0);

  // Unique marker id per edge instance
  const markerId = $derived(`arrow-${sourceX}-${sourceY}-${targetX}-${targetY}`);

  // Compute a perpendicular offset for the quadratic Bézier control point
  const path = $derived.by(() => {
    const mx = (sourceX + targetX) / 2;
    const my = (sourceY + targetY) / 2;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular direction, offset ~30px
    const px = -dy / len * 30;
    const py = dx / len * 30;
    const cx = mx + px;
    const cy = my + py;
    return `M ${sourceX} ${sourceY} Q ${cx} ${cy} ${targetX} ${targetY}`;
  });
</script>

<defs>
  <marker
    id={markerId}
    viewBox="0 0 10 6"
    refX="10"
    refY="3"
    markerWidth="8"
    markerHeight="6"
    orient="auto-start-reverse"
  >
    <path d="M 0 0 L 10 3 L 0 6 z" fill={color} />
  </marker>
</defs>

<path
  d={path}
  fill="none"
  stroke={color}
  stroke-width="1.5"
  marker-end="url(#{markerId})"
  opacity={opacity}
  stroke-dasharray="4 6"
  class="anim-edge-flow"
  style="transition: opacity 400ms, stroke 400ms;"
/>
