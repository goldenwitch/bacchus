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

  // Perturbed sample points along the base Bézier (shared by path + decorations)
  const vinePoints = $derived.by(() => {
    const sx = sourceX, sy = sourceY;
    const ex = targetX, ey = targetY;
    const cx = controlPoint.x, cy = controlPoint.y;

    const segments = 8;
    const amplitude = 5;
    const frequency = 3;

    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = quadBezier(t, sx, sy, cx, cy, ex, ey);
      const tang = quadTangent(t, sx, sy, cx, cy, ex, ey);
      const tLen = Math.sqrt(tang.tx * tang.tx + tang.ty * tang.ty) || 1;
      const nx = -tang.ty / tLen;
      const ny = tang.tx / tLen;
      const wave = Math.sin(t * Math.PI * frequency) * amplitude * Math.sin(t * Math.PI);
      points.push({ x: p.x + nx * wave, y: p.y + ny * wave });
    }
    return points;
  });

  // Smooth cubic Bézier path through the perturbed points (Catmull-Rom conversion)
  const vinePath = $derived.by(() => {
    const points = vinePoints;
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  });

  // Interpolate position + tangent angle along the perturbed polyline at parameter t∈[0,1]
  function samplePolyline(points: { x: number; y: number }[], t: number): { x: number; y: number; angle: number } {
    t = Math.max(0, Math.min(1, t));
    // Cumulative arc lengths
    const lengths: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const totalLen = lengths[lengths.length - 1] || 1;
    const targetDist = t * totalLen;
    // Find segment containing targetDist
    let seg = 0;
    for (let i = 1; i < lengths.length; i++) {
      if (lengths[i] >= targetDist) { seg = i - 1; break; }
      if (i === lengths.length - 1) seg = i - 1;
    }
    const segLen = lengths[seg + 1] - lengths[seg] || 1;
    const local = (targetDist - lengths[seg]) / segLen;
    const a = points[seg];
    const b = points[seg + 1] ?? a;
    return {
      x: a.x + (b.x - a.x) * local,
      y: a.y + (b.y - a.y) * local,
      angle: Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI),
    };
  }

  // Straight-line distance used to determine decoration count
  const edgeLength = $derived(
    Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2)
  );

  // Grapevine leaf decorations: fewer, larger, recognizable grape leaves
  const vineDecorations = $derived.by(() => {
    const count = Math.min(6, Math.max(1, Math.floor(edgeLength / 120)));
    const decorations: Array<{
      x: number; y: number; angle: number;
      side: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      const t = 0.2 + (i / (count - 1 || 1)) * 0.6;
      const { x, y, angle } = samplePolyline(vinePoints, t);
      const side = i % 2 === 0 ? 1 : -1;

      decorations.push({ x, y, angle, side });
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

<!-- Grapevine leaf decorations along the vine -->
{#each vineDecorations as deco}
  <g
    transform="translate({deco.x.toFixed(1)}, {deco.y.toFixed(1)}) rotate({(deco.angle + (deco.side > 0 ? -45 : 135)).toFixed(1)}) scale(2.2)"
    opacity={opacity}
    style="pointer-events: none; transition: opacity 400ms;"
  >
    <g>
      <!-- Petiole (short stem connecting leaf to vine) -->
      <line x1="0" y1="0" x2="3" y2="0" stroke="var(--color-vine)" stroke-width="0.5" opacity="0.4" />
      <!-- Grape leaf: 3-lobed shape -->
      <path
        d="M 3 0 C 4 -2, 6 -4.5, 9 -3.5 C 10.5 -2.5, 11 -1, 10.5 0 C 11 1, 10.5 2.5, 9 3.5 C 6 4.5, 4 2, 3 0 z"
        fill="var(--color-vine-leaf)"
        opacity="0.4"
      />
      <!-- Center vein -->
      <line x1="3.5" y1="0" x2="9.5" y2="0" stroke="var(--color-vine)" stroke-width="0.3" opacity="0.25" />
    </g>
  </g>
{/each}
