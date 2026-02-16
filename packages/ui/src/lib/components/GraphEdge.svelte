<script lang="ts">
  let {
    sourceX,
    sourceY,
    targetX,
    targetY,
    highlighted = false,
    dimmed = false,
    visible = true,
    color = 'var(--color-vine)',
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
  const markerId = $derived(`leaf-${sourceId || 'src'}-${targetId || 'tgt'}`);

  // Compute a perpendicular offset for the base Bézier control point
  // Vary offset based on edge source+target ID hash to spread overlapping edges
  const offset = $derived(
    sourceId && targetId
      ? ((sourceId.charCodeAt(0) + targetId.charCodeAt(0)) % 3) * 10 + 25
      : 30
  );

  // Evaluate a point on a quadratic Bézier at parameter t
  function quadBezier(t: number, sx: number, sy: number, cx: number, cy: number, ex: number, ey: number): { x: number; y: number } {
    const u = 1 - t;
    return {
      x: u * u * sx + 2 * u * t * cx + t * t * ex,
      y: u * u * sy + 2 * u * t * cy + t * t * ey,
    };
  }

  // Tangent of a quadratic Bézier at parameter t
  function quadTangent(t: number, sx: number, sy: number, cx: number, cy: number, ex: number, ey: number): { tx: number; ty: number } {
    const u = 1 - t;
    return {
      tx: 2 * u * (cx - sx) + 2 * t * (ex - cx),
      ty: 2 * u * (cy - sy) + 2 * t * (ey - cy),
    };
  }

  // Base control point for the quadratic curve
  const controlPoint = $derived.by(() => {
    const mx = (sourceX + targetX) / 2;
    const my = (sourceY + targetY) / 2;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      x: mx + (-dy / len) * offset,
      y: my + (dx / len) * offset,
    };
  });

  // Organic vine path: sample the base Bézier and add sinusoidal perturbation,
  // then fit smooth cubic segments through the perturbed points
  const vinePath = $derived.by(() => {
    const sx = sourceX, sy = sourceY;
    const ex = targetX, ey = targetY;
    const cx = controlPoint.x, cy = controlPoint.y;

    const segments = 8;
    const amplitude = 5;
    const frequency = 3;

    // Generate perturbed sample points along the base quad Bézier
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = quadBezier(t, sx, sy, cx, cy, ex, ey);
      const tang = quadTangent(t, sx, sy, cx, cy, ex, ey);
      const tLen = Math.sqrt(tang.tx * tang.tx + tang.ty * tang.ty) || 1;
      // Perpendicular to tangent
      const nx = -tang.ty / tLen;
      const ny = tang.tx / tLen;
      // Sine wave displacement (zero at endpoints)
      const wave = Math.sin(t * Math.PI * frequency) * amplitude * Math.sin(t * Math.PI);
      points.push({ x: p.x + nx * wave, y: p.y + ny * wave });
    }

    // Build smooth cubic Bézier path through the perturbed points
    // Using Catmull-Rom → cubic Bézier conversion
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      // Catmull-Rom to cubic Bézier control points
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  });

  // Straight-line distance used to determine decoration count
  const edgeLength = $derived(
    Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2)
  );

  // Grapevine decorations: alternating leaves and tendrils along the vine
  const vineDecorations = $derived.by(() => {
    const sx = sourceX, sy = sourceY;
    const ex = targetX, ey = targetY;
    const cx = controlPoint.x, cy = controlPoint.y;

    // Dynamic count based on edge length, min 2, max 12
    const count = Math.min(12, Math.max(2, Math.floor(edgeLength / 60)));
    
    // Evenly space from t=0.15 to t=0.85
    const decorations: Array<{
      x: number; y: number; angle: number;
      type: 'leaf' | 'tendril';
      scale: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      const t = 0.15 + (i / (count - 1 || 1)) * 0.70;
      const p = quadBezier(t, sx, sy, cx, cy, ex, ey);
      const tang = quadTangent(t, sx, sy, cx, cy, ex, ey);
      const tLen = Math.sqrt(tang.tx * tang.tx + tang.ty * tang.ty) || 1;
      const angle = Math.atan2(tang.ty, tang.tx) * (180 / Math.PI);
      const side = i % 2 === 0 ? 1 : -1;
      const type = i % 2 === 0 ? 'leaf' as const : 'tendril' as const;
      
      // Slight size variation seeded by index (0.8–1.2)
      const scale = 0.8 + ((i * 7 + 3) % 5) / 10;

      decorations.push({
        x: p.x + (-tang.ty / tLen) * 6 * side,
        y: p.y + (tang.tx / tLen) * 6 * side,
        angle: angle + (side > 0 ? -30 : 150),
        type,
        scale,
      });
    }

    return decorations;
  });
</script>

<defs>
  <!-- Leaf-shaped arrowhead marker -->
  <marker
    id={markerId}
    viewBox="0 0 12 8"
    refX="10"
    refY="4"
    markerWidth="10"
    markerHeight="8"
    orient="auto-start-reverse"
  >
    <path d="M 0 4 C 2 1, 8 0, 11 4 C 8 8, 2 7, 0 4 z" fill="var(--color-vine-leaf)" />
  </marker>
</defs>

<!-- Main vine path -->
<path
  d={vinePath}
  fill="none"
  stroke={color}
  stroke-width="2.5"
  stroke-linecap="round"
  marker-end="url(#{markerId})"
  opacity={opacity}
  stroke-dasharray={highlighted ? '8 4' : dimmed ? '4 6' : 'none'}
  class={highlighted ? 'anim-edge-flow' : ''}
  style="transition: opacity 400ms, stroke 400ms;"
/>

<!-- Grapevine decorations along the vine -->
{#each vineDecorations as deco}
  {#if deco.type === 'leaf'}
    <g
      transform="translate({deco.x.toFixed(1)}, {deco.y.toFixed(1)}) rotate({deco.angle.toFixed(1)}) scale({deco.scale.toFixed(2)})"
      opacity={opacity}
      class="anim-vine-leaf-sway"
      style="pointer-events: none; transition: opacity 400ms;"
    >
      <path
        d="M 0 0 C 1 -3, 6 -4, 8 0 C 6 4, 1 3, 0 0 z"
        fill="var(--color-vine-leaf)"
        opacity="0.8"
      />
      <!-- Leaf vein -->
      <line x1="0" y1="0" x2="7" y2="0" stroke="var(--color-vine)" stroke-width="0.5" opacity="0.5" />
    </g>
  {:else}
    <g
      transform="translate({deco.x.toFixed(1)}, {deco.y.toFixed(1)}) rotate({deco.angle.toFixed(1)}) scale({deco.scale.toFixed(2)})"
      opacity={opacity}
      class="anim-vine-tendril-sway"
      style="pointer-events: none; transition: opacity 400ms;"
    >
      <!-- Curling tendril -->
      <path
        d="M 0 0 C 2 -4, 5 -6, 4 -2 C 3 1, 6 3, 8 0"
        fill="none"
        stroke="var(--color-vine-leaf)"
        stroke-width="0.8"
        opacity="0.5"
        stroke-linecap="round"
      />
    </g>
  {/if}
{/each}
