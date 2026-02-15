<script lang="ts">
  import { untrack } from 'svelte';
  import type { VineGraph } from '@bacchus/core';
  import { getTask, getDependants, getDependencies, getRoot } from '@bacchus/core';
  import type { Simulation } from 'd3-force';
  import { zoom, zoomIdentity } from 'd3-zoom';
  import { select } from 'd3-selection';
  import 'd3-transition';
  import type { SimNode, SimLink, ViewportTransform } from '../types.js';
  import { computeNodeRadius } from '../types.js';
  import { createSimulation, computeDepths, computeFocusBandPositions, applyPhysicsConfig } from '../layout.js';
  import { computeFocusFrame } from '../camera.js';
  import { getStatusColor } from '../status.js';
  import type { PhysicsConfig, PhysicsParamKey } from '../physics.js';
  import { loadOverrides, saveOverrides, clearOverrides, resolveConfig } from '../physics.js';
  import GraphNode from './GraphNode.svelte';
  import GraphEdge from './GraphEdge.svelte';
  import { playWhoosh, playPop } from '../sound.js';
  import Sidebar from './Sidebar.svelte';
  import Tooltip from './Tooltip.svelte';
  import Toolbar from './Toolbar.svelte';
  import Legend from './Legend.svelte';
  import PhysicsPanel from './PhysicsPanel.svelte';

  let { graph, graphTitle, onreset }: { graph: VineGraph; graphTitle?: string; onreset?: () => void } = $props();

  // Viewport dimensions — bound to the wrapper div
  let width = $state(800);
  let height = $state(600);

  // Pan / zoom state
  let transform: ViewportTransform = $state({ x: 0, y: 0, k: 1 });
  let svgEl: SVGSVGElement | undefined = $state(undefined);

  // Focus state
  let focusedTaskId: string | null = $state(null);
  let savedTransform: ViewportTransform | null = null;
  let savedPositions: Map<string, { x: number; y: number }> | null = null;
  let bandAnimFrame: number | null = null;

  // Hover state
  let hoveredTaskId: string | null = $state(null);
  let mouseX = $state(0);
  let mouseY = $state(0);

  // Pan/zoom hints state
  let showHints = $state(false);
  let hintsFading = $state(false);
  let hintsTimer: ReturnType<typeof setTimeout> | null = null;

  function dismissHints() {
    if (!showHints || hintsFading) return;
    hintsFading = true;
    localStorage.setItem('bacchus-hints-seen', '1');
    setTimeout(() => {
      showHints = false;
      hintsFading = false;
    }, 500);
    if (hintsTimer) {
      clearTimeout(hintsTimer);
      hintsTimer = null;
    }
  }

  // Store d3-zoom behavior so we can programmatically set transforms
  let zoomBehavior: ReturnType<typeof zoom<SVGSVGElement, unknown>> | null = null;

  // Tick counter — mutations here trigger Svelte re-renders
  let tick = $state(0);

  // D3-force mutable arrays (D3 writes x/y in place)
  let simNodes: SimNode[] = [];
  let simLinks: SimLink[] = [];
  let simulation: Simulation<SimNode, SimLink> | null = null;

  // Entry animation state
  let entryOrder: string[] = $state([]);
  let visibleCount = $state(0);
  let entryComplete = $state(false);

  // Physics controls state
  let physicsOverrides: Partial<PhysicsConfig> = $state(loadOverrides());
  let physicsConfig: PhysicsConfig = $state(resolveConfig(0, physicsOverrides));
  let showStrataLines = $state(false);

  const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const visibleNodeSet = $derived.by(() => {
    if (entryComplete) return null; // null = all visible
    return new Set(entryOrder.slice(0, visibleCount));
  });

  // Create / recreate D3 simulation when graph or viewport changes
  $effect(() => {
    const depths = computeDepths(graph);
    const cx = width / 2;

    // Resolve physics config for current graph size.
    // Use a local variable to avoid reading $state back inside this effect
    // (reading + writing the same $state in one effect causes infinite loops).
    const overrides = untrack(() => physicsOverrides);
    const cfg = resolveConfig(graph.order.length, overrides);
    physicsConfig = cfg;

    simNodes = graph.order.map((id) => {
      const task = getTask(graph, id);
      const depth = depths.get(id) ?? 0;
      return {
        id,
        task,
        depth,
        x: cx + (Math.random() - 0.5) * 50,
        y: height * 0.1 + depth * cfg.layerSpacing + (Math.random() - 0.5) * 20,
      };
    });

    simLinks = graph.order.flatMap((id) => {
      const task = getTask(graph, id);
      return task.dependencies.map((depId) => ({
        source: id,
        target: depId,
      }));
    });

    simulation?.stop();
    simulation = createSimulation(simNodes, simLinks, width, height, cfg);
    simulation.on('tick', () => {
      tick++;
    });

    // Show pan/zoom hints on first load
    if (!localStorage.getItem('bacchus-hints-seen')) {
      showHints = true;
      hintsFading = false;
      hintsTimer = setTimeout(dismissHints, 4000);
    }

    // Entry animation — stagger node visibility (leaves first, root last)
    entryComplete = false;
    visibleCount = 0;
    const sorted = [...graph.order].sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0));
    entryOrder = sorted;

    const entryTimeouts: ReturnType<typeof setTimeout>[] = [];
    if (prefersReducedMotion) {
      visibleCount = sorted.length;
      entryComplete = true;
    } else {
      sorted.forEach((_id, i) => {
        const t = setTimeout(() => {
          visibleCount = i + 1;
          playPop();
        }, i * 80);
        entryTimeouts.push(t);
      });
      const finalTimeout = setTimeout(() => {
        entryComplete = true;
      }, sorted.length * 80);
      entryTimeouts.push(finalTimeout);
    }

    return () => {
      simulation?.stop();
      entryTimeouts.forEach(clearTimeout);
      if (hintsTimer) { clearTimeout(hintsTimer); hintsTimer = null; }
    };
  });

  // Snapshot node positions each tick so Svelte picks up the changes
  const displayNodes = $derived.by(() => {
    void tick; // subscribe to tick updates
    return simNodes.map((n) => ({ ...n }));
  });

  // Compute strata line Y-positions from unique depth values + current config
  const strataLinePositions = $derived.by(() => {
    const depths = new Set(simNodes.map((n) => n.depth));
    return [...depths]
      .sort((a, b) => a - b)
      .map((d) => height * 0.1 + d * physicsConfig.layerSpacing);
  });

  // Setup d3-zoom on the SVG element
  $effect(() => {
    if (!svgEl) return;

    zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4.0])
      .filter((event: Event) => {
        // Allow all wheel events for zoom, allow all other events for pan
        return true;
      })
      .on('zoom', (event) => {
        transform = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        dismissHints();
      });

    select(svgEl).call(zoomBehavior);

    return () => {
      select(svgEl).on('.zoom', null);
      zoomBehavior = null;
    };
  });

  // Derived focus/dimming state
  const connectedIds = $derived.by(() => {
    if (!focusedTaskId) return new Set<string>();
    const ids = new Set<string>([focusedTaskId]);
    for (const t of getDependants(graph, focusedTaskId)) ids.add(t.id);
    for (const t of getDependencies(graph, focusedTaskId)) ids.add(t.id);
    return ids;
  });

  const focusedStatusColor = $derived.by(() => {
    if (!focusedTaskId) return 'var(--color-edge)';
    const task = getTask(graph, focusedTaskId);
    return getStatusColor(task.status);
  });

  // Derived focused and hovered tasks
  const focusedTask = $derived(focusedTaskId ? getTask(graph, focusedTaskId) : null);
  const hoveredTask = $derived(hoveredTaskId ? getTask(graph, hoveredTaskId) : null);

  // Focus camera framing + band layout animation
  // Only re-run when focusedTaskId changes — use untrack for all other reads.
  $effect(() => {
    const fid = focusedTaskId; // tracked — the trigger
    untrack(() => {
      if (fid) {
        playWhoosh();
        // Cancel any running band animation
        if (bandAnimFrame) { cancelAnimationFrame(bandAnimFrame); bandAnimFrame = null; }

        // Save current camera position
        savedTransform = { x: transform.x, y: transform.y, k: transform.k };

        // Save current node positions
        savedPositions = new Map(simNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));

        // Pause simulation so D3 doesn't fight our animation
        simulation?.stop();

        // Compute band targets
        const depIds = getTask(graph, fid).dependencies;
        const dependantIds = getDependants(graph, fid).map((t) => t.id);
        const w = width;
        const h = height;
        const bandTargets = computeFocusBandPositions(
          fid,
          simNodes.map((n) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 })),
          dependantIds,
          depIds,
          w,
          h,
        );
        const targetMap = new Map(bandTargets.map((b) => [b.id, b]));

        // Capture start positions for lerp
        const starts = new Map(simNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
        const duration = prefersReducedMotion ? 0 : 500;
        const t0 = performance.now();

        function animateBands(now: number) {
          const elapsed = now - t0;
          const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 1;
          // Ease-out cubic
          const ease = 1 - Math.pow(1 - progress, 3);

          for (const node of simNodes) {
            const target = targetMap.get(node.id);
            const start = starts.get(node.id);
            if (target && start) {
              node.x = start.x + (target.x - start.x) * ease;
              node.y = start.y + (target.y - start.y) * ease;
            }
          }
          tick++;

          if (progress < 1) {
            bandAnimFrame = requestAnimationFrame(animateBands);
          } else {
            bandAnimFrame = null;
          }
        }

        if (duration > 0) {
          bandAnimFrame = requestAnimationFrame(animateBands);
        } else {
          for (const node of simNodes) {
            const target = targetMap.get(node.id);
            if (target) { node.x = target.x; node.y = target.y; }
          }
          tick++;
        }

        // Animate camera to frame the band targets
        const depPositions = depIds
          .map((id) => targetMap.get(id))
          .filter(Boolean)
          .map((b) => ({ x: b!.x, y: b!.y }));
        const dependantPositions = dependantIds
          .map((id) => targetMap.get(id))
          .filter(Boolean)
          .map((b) => ({ x: b!.x, y: b!.y }));
        const focusedTarget = targetMap.get(fid);
        if (focusedTarget) {
          const camT = computeFocusFrame(
            { x: focusedTarget.x, y: focusedTarget.y },
            dependantPositions,
            depPositions,
            w,
            h,
          );
          if (svgEl && zoomBehavior) {
            select(svgEl).transition().duration(600).call(
              zoomBehavior.transform,
              zoomIdentity.translate(camT.x, camT.y).scale(camT.k),
            );
          }
        }
      } else if (savedTransform) {
        playWhoosh();
        // Cancel any running band animation
        if (bandAnimFrame) { cancelAnimationFrame(bandAnimFrame); bandAnimFrame = null; }

        // Restore pre-focus node positions
        if (savedPositions) {
          const starts = new Map(simNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
          const targets = savedPositions;
          savedPositions = null;
          const duration = prefersReducedMotion ? 0 : 500;
          const t0 = performance.now();

          function animateRestore(now: number) {
            const elapsed = now - t0;
            const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 1;
            const ease = 1 - Math.pow(1 - progress, 3);

            for (const node of simNodes) {
              const target = targets.get(node.id);
              const start = starts.get(node.id);
              if (target && start) {
                node.x = start.x + (target.x - start.x) * ease;
                node.y = start.y + (target.y - start.y) * ease;
              }
            }
            tick++;

            if (progress < 1) {
              bandAnimFrame = requestAnimationFrame(animateRestore);
            } else {
              bandAnimFrame = null;
              simulation?.alpha(0.3).restart();
            }
          }

          if (duration > 0) {
            bandAnimFrame = requestAnimationFrame(animateRestore);
          } else {
            for (const node of simNodes) {
              const target = targets.get(node.id);
              if (target) { node.x = target.x; node.y = target.y; }
            }
            tick++;
            simulation?.alpha(0.3).restart();
          }
        }

        // Restore pre-focus camera
        const camT = savedTransform;
        savedTransform = null;
        if (svgEl && zoomBehavior) {
          select(svgEl).transition().duration(600).call(
            zoomBehavior.transform,
            zoomIdentity.translate(camT.x, camT.y).scale(camT.k),
          );
        }
      }
    });
  });

  function handleZoomIn() {
    if (svgEl && zoomBehavior) {
      select(svgEl).transition().duration(200).call(zoomBehavior.scaleBy, 1.4);
    }
  }

  function handleZoomOut() {
    if (svgEl && zoomBehavior) {
      select(svgEl).transition().duration(200).call(zoomBehavior.scaleBy, 1 / 1.4);
    }
  }

  function handlePhysicsChange(key: PhysicsParamKey, value: number) {
    physicsOverrides = { ...physicsOverrides, [key]: value };
    physicsConfig = resolveConfig(graph.order.length, physicsOverrides);
    saveOverrides(physicsOverrides);
    if (simulation && !focusedTaskId) {
      applyPhysicsConfig(simulation, physicsConfig, width, height);
    }
  }

  function handlePhysicsReset() {
    physicsOverrides = {};
    physicsConfig = resolveConfig(graph.order.length, {});
    clearOverrides();
    if (simulation && !focusedTaskId) {
      applyPhysicsConfig(simulation, physicsConfig, width, height);
    }
  }

  function handleFitView() {
    if (!svgEl || !zoomBehavior || displayNodes.length === 0) return;
    const w = svgEl.clientWidth;
    const h = svgEl.clientHeight;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of displayNodes) {
      const r = n.radius || 40;
      if (n.x! - r < minX) minX = n.x! - r;
      if (n.y! - r < minY) minY = n.y! - r;
      if (n.x! + r > maxX) maxX = n.x! + r;
      if (n.y! + r > maxY) maxY = n.y! + r;
    }

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const padding = 80;
    const scale = Math.min(
      (w - padding * 2) / graphWidth,
      (h - padding * 2) / graphHeight,
      4
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const tx = w / 2 - cx * scale;
    const ty = h / 2 - cy * scale;

    const t = zoomIdentity.translate(tx, ty).scale(scale);
    select(svgEl).transition().duration(500).call(zoomBehavior.transform, t);
  }

  // Snapshot link endpoints each tick — clip to node circle boundaries
  const displayLinks = $derived.by(() => {
    void tick;
    return simLinks.map((l) => {
      const src = typeof l.source === 'object' ? (l.source as SimNode) : null;
      const tgt = typeof l.target === 'object' ? (l.target as SimNode) : null;
      const srcId = src ? src.id : (l.source as string);
      const tgtId = tgt ? tgt.id : (l.target as string);
      const sx = src?.x ?? 0;
      const sy = src?.y ?? 0;
      const tx = tgt?.x ?? 0;
      const ty = tgt?.y ?? 0;

      // Compute angle and offset endpoints to circle edges
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const srcRadius = computeNodeRadius(src?.task.shortName.length ?? 4);
      const tgtRadius = computeNodeRadius(tgt?.task.shortName.length ?? 4);
      const ux = dx / dist;
      const uy = dy / dist;

      return {
        sourceId: srcId,
        targetId: tgtId,
        sourceX: sx + ux * srcRadius,
        sourceY: sy + uy * srcRadius,
        targetX: tx - ux * tgtRadius,
        targetY: ty - uy * tgtRadius,
      };
    });
  });
</script>

<div bind:clientWidth={width} bind:clientHeight={height} style="width: 100%; height: 100%;">
  <svg
    bind:this={svgEl}
    role="img"
    aria-label="Task dependency graph for {getRoot(graph).shortName}"
    style="width: 100%; height: 100%; display: block; background: var(--bg-primary); touch-action: none;"
    onclick={() => { focusedTaskId = null; dismissHints(); }}
    onkeydown={(e: KeyboardEvent) => { if (e.key === 'Escape') focusedTaskId = null; }}
  >
    <g transform="translate({transform.x}, {transform.y}) scale({transform.k})">
      {#if showStrataLines}
        {#each strataLinePositions as strataY}
          <line
            x1={-50000}
            x2={50000}
            y1={strataY}
            y2={strataY}
            stroke="var(--color-strata-line)"
            stroke-width={2 / transform.k}
            stroke-dasharray="{8 / transform.k},{6 / transform.k}"
            pointer-events="none"
          />
        {/each}
      {/if}

      {#each displayNodes as node (node.id)}
        <GraphNode
          {node}
          focused={node.id === focusedTaskId}
          dimmed={focusedTaskId !== null && !connectedIds.has(node.id)}
          isRoot={node.id === graph.order[graph.order.length - 1]}
          visible={visibleNodeSet === null || visibleNodeSet.has(node.id)}
          onfocus={(id) => { focusedTaskId = id; }}
          onhoverstart={(id, event) => { hoveredTaskId = id; mouseX = event.clientX; mouseY = event.clientY; }}
          onhoverend={() => { hoveredTaskId = null; }}
        />
      {/each}

      <g pointer-events="none">
        {#each displayLinks as link (link.sourceId + '-' + link.targetId)}
          <GraphEdge
            sourceX={link.sourceX}
            sourceY={link.sourceY}
            targetX={link.targetX}
            targetY={link.targetY}
            sourceId={link.sourceId}
            targetId={link.targetId}
            highlighted={focusedTaskId !== null && (link.sourceId === focusedTaskId || link.targetId === focusedTaskId)}
            dimmed={focusedTaskId !== null && link.sourceId !== focusedTaskId && link.targetId !== focusedTaskId}
            color={focusedTaskId !== null && (link.sourceId === focusedTaskId || link.targetId === focusedTaskId) ? focusedStatusColor : 'var(--color-edge-dim)'}
            visible={visibleNodeSet === null || (visibleNodeSet.has(link.sourceId) && visibleNodeSet.has(link.targetId))}
          />
        {/each}
      </g>
    </g>
  </svg>
  {#if showHints}
    <div class="hints-pill" class:hints-fade-out={hintsFading}>Scroll to zoom &bull; Drag to pan</div>
  {/if}
  {#if graph.order.length === 1}
    <div class="single-task-hint">
      This graph has a single task — add more tasks to see connections!
    </div>
  {/if}
  <Sidebar task={focusedTask} {graph} onclose={() => focusedTaskId = null} onfocus={(taskId) => focusedTaskId = taskId} />
  <Tooltip task={hoveredTask && !focusedTaskId ? hoveredTask : null} x={mouseX} y={mouseY} />
  <Toolbar {onreset} {graphTitle} onzoomin={handleZoomIn} onzoomout={handleZoomOut} onfitview={handleFitView} zoomLevel={transform.k} svgElement={svgEl} />
  <PhysicsPanel config={physicsConfig} onchange={handlePhysicsChange} onreset={handlePhysicsReset} {showStrataLines} ontogglestrata={(show) => { showStrataLines = show; }} />
  <Legend />
</div>

<style>
  .hints-pill {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--hint-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
    border-radius: 20px;
    padding: 8px 20px;
    color: var(--text-muted);
    font-size: 0.8rem;
    z-index: 140;
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.5s ease;
  }
  .hints-fade-out {
    opacity: 0;
  }

  .single-task-hint {
    position: absolute;
    bottom: 30%;
    left: 50%;
    transform: translateX(-50%);
    color: var(--text-muted);
    font-size: 0.85rem;
    text-align: center;
    padding: 10px 20px;
    background: var(--hint-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    z-index: 120;
    pointer-events: none;
    max-width: 340px;
  }
</style>
