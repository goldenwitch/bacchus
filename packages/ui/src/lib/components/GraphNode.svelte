<script lang="ts">
  import { computeNodeRadius, type SimNode } from '../types.js';
  import { STATUS_MAP, themeVersion } from '../status.js';
  import { playPop, playHover } from '../sound.js';
  import { getSpriteKey } from '../sprites/registry.js';
  import { getTintFilterId, getRefTintFilterId } from '../sprites/tint.js';

  let {
    node,
    focused,
    dimmed,
    isRoot = false,
    visible = true,
    onfocus,
    onhoverstart,
    onhoverend,
  }: {
    node: SimNode;
    focused: boolean;
    dimmed: boolean;
    isRoot?: boolean;
    visible?: boolean;
    onfocus: (id: string) => void;
    onhoverstart: (id: string, event: PointerEvent) => void;
    onhoverend: () => void;
  } = $props();

  const statusInfo = $derived.by(() => {
    void themeVersion();
    return node.task.kind === 'task'
      ? STATUS_MAP[node.task.status]
      : STATUS_MAP['notstarted'];
  });

  const radius = $derived(computeNodeRadius(node.task.shortName.length));

  const spriteKey = $derived(getSpriteKey(node.task));
  const spriteTintFilter = $derived(
    node.task.kind === 'task'
      ? getTintFilterId(node.task.status)
      : getRefTintFilterId(),
  );

  const opacity = $derived(dimmed ? 0.45 : 1.0);

  // Glass effect: lighten/darken the status fill for the gradient
  function adjustColor(hex: string, amount: number): string {
    const r = Math.min(
      255,
      Math.max(0, parseInt(hex.slice(1, 3), 16) + amount),
    );
    const g = Math.min(
      255,
      Math.max(0, parseInt(hex.slice(3, 5), 16) + amount),
    );
    const b = Math.min(
      255,
      Math.max(0, parseInt(hex.slice(5, 7), 16) + amount),
    );
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  const darkenedColor = $derived(adjustColor(statusInfo.darkColor, -20));

  // Read CSS vars for node text controls (see app.css :root)
  function getCSSVar(name: string, fallback: number): number {
    if (typeof document === 'undefined') return fallback;
    const val = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return val ? Number(val) : fallback;
  }

  const nodeFontSize = $derived.by(() => {
    void themeVersion();
    return getCSSVar('--node-font-size', 14);
  });
  const nodeFontWeight = $derived.by(() => {
    void themeVersion();
    return getCSSVar('--node-font-weight', 400);
  });
  const nodeTextStrokeWidth = $derived.by(() => {
    void themeVersion();
    return getCSSVar('--node-text-stroke-width', 0.5);
  });
  const nodeTextGlowRadius = $derived.by(() => {
    void themeVersion();
    return getCSSVar('--node-text-glow-radius', 2);
  });
  const nodeTextGlowOpacity = $derived.by(() => {
    void themeVersion();
    return getCSSVar('--node-text-glow-opacity', 0.7);
  });

  // Step 1: Wrap & truncate label text to fit inside the circle
  const textLines = $derived.by(() => {
    const name = node.task.shortName;
    const charWidth = 8.5; // approx px per char at font-size 14, weight 400 (Fredoka)
    const padding = 14; // horizontal margin from circle edge
    const lineHeight = 17; // vertical distance between line centres

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
        if (diff <= bestDiff) {
          bestDiff = diff;
          bestSplit = i;
        }
      }

      let line1 = words.slice(0, bestSplit).join(' ');
      let line2 = words.slice(bestSplit).join(' ');
      if (line1.length > maxPerLine)
        line1 = line1.slice(0, maxPerLine - 1) + '\u2026';
      if (line2.length > maxPerLine)
        line2 = line2.slice(0, maxPerLine - 1) + '\u2026';

      return [
        { text: line1, y: -half },
        { text: line2, y: half },
      ];
    }

    // Single long word — truncate
    return [
      { text: name.slice(0, Math.max(1, maxSingleChars - 1)) + '\u2026', y: 0 },
    ];
  });

  // Reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
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
    fillLuminance > 0.4
      ? 'var(--color-node-text-dark)'
      : 'var(--color-node-text-light)',
  );

  // Colour-matched stroke (using darkened node colour instead of harsh black)
  const textStrokeColor = $derived(darkenedColor);

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
      setTimeout(() => {
        nodeScale = 1.1;
      }, 80);
      setTimeout(() => {
        nodeScale = 1.0;
      }, 200);
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
        setTimeout(() => {
          nodeScale = 1.1;
        }, 80);
        setTimeout(() => {
          nodeScale = 1.0;
        }, 200);
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
  {opacity}
  class={statusInfo.cssClass}
  style="cursor: pointer;"
  tabindex={0}
  role="button"
  aria-label="{node.task.shortName}, status: {statusInfo.label}"
  onclick={handleClick}
  onkeydown={handleKeydown}
  onpointerenter={handlePointerEnter}
  onpointerleave={handlePointerLeave}
  onfocusin={() => (isFocused = true)}
  onfocusout={() => (isFocused = false)}
>
  <g transform="scale({nodeScale})" style="transform-origin: 0px 0px;">
    <!-- Per-node defs (text glow only — sprite defs are shared in GraphView) -->
    <defs>
      <!-- Glow blur for outer ring -->
      <filter id="glow-{node.id}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
      </filter>
      <!-- Text glow: soft coloured halo behind label for contrast -->
      <filter
        id="textGlow-{node.id}"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
      >
        <feDropShadow
          dx="0"
          dy="0"
          stdDeviation={nodeTextGlowRadius}
          flood-color={darkenedColor}
          flood-opacity={nodeTextGlowOpacity}
        />
      </filter>
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
      filter="url(#glow-{node.id})"
      opacity="0.6"
      class={node.task.kind === 'task' && node.task.status === 'started'
        ? 'anim-glow-pulse'
        : ''}
    />

    <!-- Sprite-based bubble fill (tinted per status) -->
    <use
      href="#sprite-default"
      x={-radius}
      y={-radius}
      width={radius * 2}
      height={radius * 2}
      filter="url(#{spriteTintFilter})"
      class={node.task.kind === 'task' && node.task.status === 'complete'
        ? 'anim-completion-shimmer'
        : ''}
      style="pointer-events: none;"
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
    <circle
      cx={0}
      cy={-radius - 4}
      r="12"
      fill="var(--bg-primary)"
      stroke={isRoot ? 'var(--color-root-ring)' : statusInfo.color}
      stroke-width="1.5"
    />
    <text
      x={0}
      y={-radius - 4}
      font-size="14"
      text-anchor="middle"
      dominant-baseline="central"
      style="pointer-events: none;">{isRoot ? '👑' : statusInfo.emoji}</text
    >

    <!-- Floating label with soft glow halo for readability -->
    <text
      fill={textColor}
      font-family="var(--font-bubble)"
      font-size={nodeFontSize}
      font-weight={nodeFontWeight}
      text-anchor="middle"
      stroke={textStrokeColor}
      stroke-width={nodeTextStrokeWidth}
      paint-order="stroke fill"
      filter="url(#textGlow-{node.id})"
      class="anim-label-bob"
      style="pointer-events: none;"
      >{#each textLines as line, i (i)}<tspan
          x="0"
          y={line.y}
          dominant-baseline="central">{line.text}</tspan
        >{/each}</text
    >

    <!-- Attachment badge — bottom-right of node -->
    {#if node.task.kind === 'task' && node.task.attachments?.length}
      <g class="attachment-badge">
        <circle
          cx={radius * 0.65}
          cy={radius * 0.65}
          r={radius * 0.28}
          fill="rgba(30,30,30,0.85)"
          stroke="rgba(255,255,255,0.3)"
          stroke-width="1"
        />
        <text
          x={radius * 0.65}
          y={radius * 0.65}
          text-anchor="middle"
          dominant-baseline="central"
          font-size={radius * 0.28}
          style="pointer-events:none">📎</text
        >
        {#if node.task.attachments.length > 1}
          <text
            x={radius * 0.65 + radius * 0.18}
            y={radius * 0.65 + radius * 0.18}
            text-anchor="middle"
            dominant-baseline="central"
            font-size={radius * 0.18}
            fill="white"
            style="pointer-events:none">{node.task.attachments.length}</text
          >
        {/if}
      </g>
    {/if}
  </g>
</g>
