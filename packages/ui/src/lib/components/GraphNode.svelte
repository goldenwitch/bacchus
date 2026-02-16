<script lang="ts">
  import { computeNodeRadius, type SimNode } from '../types.js';
  import { STATUS_MAP, themeVersion } from '../status.js';
  import { playPop, playHover } from '../sound.js';

  let { node, focused, dimmed, isRoot = false, visible = true, onfocus, onhoverstart, onhoverend }: { node: SimNode; focused: boolean; dimmed: boolean; isRoot?: boolean; visible?: boolean; onfocus: (id: string) => void; onhoverstart: (id: string, event: PointerEvent) => void; onhoverend: () => void } = $props();

  const statusInfo = $derived.by(() => { void themeVersion(); return STATUS_MAP[node.task.status]; });

  const radius = $derived(computeNodeRadius(node.task.shortName.length));

  const opacity = $derived(dimmed ? 0.45 : 1.0);

  const filterId = $derived(`glow-${node.id}`);
  const glassGradId = $derived(`glassGrad-${node.id}`);

  // Glass effect: lighten the status fill for the gradient highlight
  function adjustColor(hex: string, amount: number): string {
    const r = Math.min(255, Math.max(0, parseInt(hex.slice(1, 3), 16) + amount));
    const g = Math.min(255, Math.max(0, parseInt(hex.slice(3, 5), 16) + amount));
    const b = Math.min(255, Math.max(0, parseInt(hex.slice(5, 7), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  const lightenedColor = $derived(adjustColor(statusInfo.darkColor, 40));
  const darkenedColor = $derived(adjustColor(statusInfo.darkColor, -20));

  // Step 1: Wrap & truncate label text to fit inside the circle
  const textLines = $derived.by(() => {
    const name = node.task.shortName;
    const charWidth = 7.0;  // approx px per char at font-size 12, weight 600
    const padding = 12;     // horizontal margin from circle edge
    const lineHeight = 15;  // vertical distance between line centres

    // Horizontal chord at vertical offset y from circle centre
    const chordWidth = (y: number) =>
      2 * Math.sqrt(Math.max(0, radius * radius - y * y)) - padding;

    // Try single centred line
    const maxSingleChars = Math.floor(chordWidth(0) / charWidth);
    if (name.length <= maxSingleChars) {
      return [{ text: name, y: 0 }];
    }

    // Try two lines at a word boundary
    const words = name.split(' ');
    if (words.length >= 2) {
      const half = lineHeight / 2;
      const maxPerLine = Math.floor(chordWidth(half) / charWidth);

      // Pick the most balanced split (prefer longer first line on ties)
      let bestSplit = 1;
      let bestDiff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const diff = Math.abs(
          words.slice(0, i).join(' ').length - words.slice(i).join(' ').length,
        );
        if (diff <= bestDiff) { bestDiff = diff; bestSplit = i; }
      }

      let line1 = words.slice(0, bestSplit).join(' ');
      let line2 = words.slice(bestSplit).join(' ');
      if (line1.length > maxPerLine) line1 = line1.slice(0, maxPerLine - 1) + '\u2026';
      if (line2.length > maxPerLine) line2 = line2.slice(0, maxPerLine - 1) + '\u2026';

      return [
        { text: line1, y: -half },
        { text: line2, y: half },
      ];
    }

    // Single long word — truncate
    return [{ text: name.slice(0, Math.max(1, maxSingleChars - 1)) + '\u2026', y: 0 }];
  });

  // Reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // Focus state for keyboard navigation
  let isFocused = $state(false);

  // Step 2: Adaptive text & stroke colours based on fill luminance
  const fillLuminance = $derived.by(() => {
    const hex = statusInfo.darkColor;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  });

  const textColor = $derived(
    fillLuminance > 0.40 ? 'var(--color-node-text-dark)' : 'var(--color-node-text-light)',
  );

  // Stronger outline on dark fills so light text stays crisp
  const textStrokeColor = $derived(
    fillLuminance > 0.40 ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.85)',
  );
  const textStrokeWidth = $derived(fillLuminance > 0.40 ? 1.5 : 2.5);

  // Scale animation state
  let nodeScale = $state(visible ? 1 : 0);

  // rAF-based tween to avoid GPU compositing layer promotion that corrupts
  // SVG filter rendering (same class of bug as the .anim-label-bob removal).
  let tweenRafId: number | null = null;

  function cancelTween() {
    if (tweenRafId !== null) {
      cancelAnimationFrame(tweenRafId);
      tweenRafId = null;
    }
  }

  function animateScale(from: number, to: number, duration: number) {
    cancelTween();
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // Approximate cubic-bezier(0.34, 1.56, 0.64, 1) with an overshoot ease-out
      const ease = 1 - Math.pow(1 - t, 3) * (1 - 1.56 * t);
      nodeScale = from + (to - from) * ease;
      if (t < 1) {
        tweenRafId = requestAnimationFrame(tick);
      } else {
        nodeScale = to;
        tweenRafId = null;
      }
    }
    tweenRafId = requestAnimationFrame(tick);
  }

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
    if (!prefersReducedMotion) {
      cancelTween();
      // Squish sequence: 0.9 → 1.1 → 1.0
      nodeScale = 0.9;
      setTimeout(() => { nodeScale = 1.1; }, 80);
      setTimeout(() => { nodeScale = 1.0; }, 200);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.key === ' ') event.preventDefault();
      onfocus(node.id);
      playPop();
      if (!prefersReducedMotion) {
        cancelTween();
        nodeScale = 0.9;
        setTimeout(() => { nodeScale = 1.1; }, 80);
        setTimeout(() => { nodeScale = 1.0; }, 200);
      }
    }
  }

  function handlePointerEnter(event: PointerEvent) {
    onhoverstart(node.id, event);
    playHover();
    if (!prefersReducedMotion) animateScale(nodeScale, 1.08, 200);
  }

  function handlePointerLeave() {
    onhoverend();
    if (!prefersReducedMotion) {
      animateScale(nodeScale, 1, 200);
    } else {
      nodeScale = 1;
    }
  }
</script>

<g
  transform="translate({node.x ?? 0}, {node.y ?? 0})"
  opacity={opacity}
  class={statusInfo.cssClass}
  style="cursor: pointer;"
  tabindex={0}
  role="button"
  aria-label="{node.task.shortName}, status: {statusInfo.label}"
  onclick={handleClick}
  onkeydown={handleKeydown}
  onpointerenter={handlePointerEnter}
  onpointerleave={handlePointerLeave}
  onfocusin={() => isFocused = true}
  onfocusout={() => isFocused = false}
>
  <g transform="scale({nodeScale})" style="transform-origin: 0px 0px;">
    <!-- SVG filters and gradients -->
    <defs>
      <!-- Outer glow blur -->
      <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
      </filter>

      <!-- Radial gradient: subtle lighter center → base → slightly darker edge -->
      <radialGradient id={glassGradId} cx="45%" cy="40%" r="60%">
        <stop offset="0%" stop-color={lightenedColor} />
        <stop offset="60%" stop-color={statusInfo.darkColor} />
        <stop offset="100%" stop-color={darkenedColor} />
      </radialGradient>

    </defs>

    <!-- Root node gold outer ring -->
    {#if isRoot}
      <circle
        r={radius + 4}
        fill="none"
        stroke="var(--color-root-ring)"
        stroke-width="2.5"
        stroke-dasharray="4 2"
      />
    {/if}

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

    <!-- Inner fill circle with gradient -->
    <circle
      r={radius}
      fill="url(#{glassGradId})"
      stroke={statusInfo.color}
      stroke-width="1.5"
      class={node.task.status === 'complete' ? 'anim-completion-shimmer' : ''}
    />

    <!-- Keyboard focus ring -->
    {#if isFocused}
      <circle
        r={radius + 8}
        fill="none"
        stroke="var(--focus-ring)"
        stroke-width="2.5"
      />
    {/if}

    <!-- Emoji badge — centered above node -->
    <circle cx={0} cy={-radius - 4} r="12" fill="var(--bg-primary)" stroke={isRoot ? 'var(--color-root-ring)' : statusInfo.color} stroke-width="1.5" />
    <text
      x={0}
      y={-radius - 4}
      font-size="14"
      text-anchor="middle"
      dominant-baseline="central"
      style="pointer-events: none;"
    >{isRoot ? '👑' : statusInfo.emoji}</text>

    <!-- Floating label with adaptive stroke for readability -->
    <text
      fill={textColor}
      font-size="12"
      font-weight="600"
      text-anchor="middle"
      stroke={textStrokeColor}
      stroke-width={textStrokeWidth}
      paint-order="stroke fill"
      class="anim-label-bob"
      style="pointer-events: none;"
    >{#each textLines as line}<tspan x="0" y={line.y} dominant-baseline="central">{line.text}</tspan>{/each}</text>
  </g>
</g>
