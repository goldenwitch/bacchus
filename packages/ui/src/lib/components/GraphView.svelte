<script lang="ts">
  import type { VineGraph } from '@bacchus/core';
  import { getTask, getDependants, getDependencies } from '@bacchus/core';
  import type { Simulation } from 'd3-force';
  import { zoom, zoomIdentity } from 'd3-zoom';
  import { select } from 'd3-selection';
  import 'd3-transition';
  import type { SimNode, SimLink, ViewportTransform } from '../types.js';
  import { createSimulation, computeDepths } from '../layout.js';
  import { computeFocusFrame } from '../camera.js';
  import { getStatusColor } from '../status.js';
  import GraphNode from './GraphNode.svelte';
  import GraphEdge from './GraphEdge.svelte';
  import { playWhoosh, playPop } from '../sound.js';
  import Sidebar from './Sidebar.svelte';
  import Tooltip from './Tooltip.svelte';
  import Toolbar from './Toolbar.svelte';

  let { graph }: { graph: VineGraph } = $props();

  // Viewport dimensions — bound to the wrapper div
  let width = $state(800);
  let height = $state(600);

  // Pan / zoom state
  let transform: ViewportTransform = $state({ x: 0, y: 0, k: 1 });
  let svgEl: SVGSVGElement | undefined = $state(undefined);

  // Focus state
  let focusedTaskId: string | null = $state(null);
  let savedTransform: ViewportTransform | null = null;

  // Hover state
  let hoveredTaskId: string | null = $state(null);
  let mouseX = $state(0);
  let mouseY = $state(0);

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

  const visibleNodeSet = $derived.by(() => {
    if (entryComplete) return null; // null = all visible
    return new Set(entryOrder.slice(0, visibleCount));
  });

  // Create / recreate D3 simulation when graph or viewport changes
  $effect(() => {
    const depths = computeDepths(graph);
    const cx = width / 2;
    const cy = height / 2;

    simNodes = graph.order.map((id) => {
      const task = getTask(graph, id);
      return {
        id,
        task,
        depth: depths.get(id) ?? 0,
        x: cx + (Math.random() - 0.5) * 50,
        y: cy + (Math.random() - 0.5) * 50,
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
    simulation = createSimulation(simNodes, simLinks, width, height);
    simulation.on('tick', () => {
      tick++;
    });

    // Entry animation — stagger node visibility (leaves first, root last)
    entryComplete = false;
    visibleCount = 0;
    const sorted = [...graph.order].sort((a, b) => (depths.get(b) ?? 0) - (depths.get(a) ?? 0));
    entryOrder = sorted;

    const entryTimeouts: ReturnType<typeof setTimeout>[] = [];
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

    return () => {
      simulation?.stop();
      entryTimeouts.forEach(clearTimeout);
    };
  });

  // Snapshot node positions each tick so Svelte picks up the changes
  const displayNodes = $derived.by(() => {
    void tick; // subscribe to tick updates
    return simNodes.map((n) => ({ ...n }));
  });

  // Setup d3-zoom on the SVG element
  $effect(() => {
    if (!svgEl) return;

    zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4.0])
      .filter((event: Event) => {
        if (event.type === 'wheel') {
          return (event as WheelEvent).ctrlKey;
        }
        return true;
      })
      .on('zoom', (event) => {
        transform = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
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
    if (!focusedTaskId) return '#475569';
    const task = getTask(graph, focusedTaskId);
    return getStatusColor(task.status);
  });

  // Derived focused and hovered tasks
  const focusedTask = $derived(focusedTaskId ? getTask(graph, focusedTaskId) : null);
  const hoveredTask = $derived(hoveredTaskId ? getTask(graph, hoveredTaskId) : null);

  // Focus camera framing
  $effect(() => {
    if (focusedTaskId) {
      playWhoosh();
      // Save current camera position
      savedTransform = { ...transform };
      // Compute focus frame
      const focusedNode = displayNodes.find(n => n.id === focusedTaskId);
      if (!focusedNode) return;
      const depIds = focusedNode.task.dependencies;
      const dependantIds = getDependants(graph, focusedTaskId).map(t => t.id);
      const depPositions = depIds
        .map(id => displayNodes.find(n => n.id === id))
        .filter(Boolean)
        .map(n => ({ x: n!.x ?? 0, y: n!.y ?? 0 }));
      const dependantPositions = dependantIds
        .map(id => displayNodes.find(n => n.id === id))
        .filter(Boolean)
        .map(n => ({ x: n!.x ?? 0, y: n!.y ?? 0 }));
      const focusedPos = { x: focusedNode.x ?? 0, y: focusedNode.y ?? 0 };
      const t = computeFocusFrame(focusedPos, dependantPositions, depPositions, width, height);
      // Animate camera via d3-zoom to keep internal state in sync
      if (svgEl && zoomBehavior) {
        select(svgEl).transition().duration(600).call(
          zoomBehavior.transform,
          zoomIdentity.translate(t.x, t.y).scale(t.k)
        );
      }
    } else if (savedTransform) {
      playWhoosh();
      // Restore pre-focus camera
      const t = savedTransform;
      savedTransform = null;
      if (svgEl && zoomBehavior) {
        select(svgEl).transition().duration(600).call(
          zoomBehavior.transform,
          zoomIdentity.translate(t.x, t.y).scale(t.k)
        );
      }
    }
  });

  // Snapshot link endpoints each tick
  const displayLinks = $derived.by(() => {
    void tick;
    return simLinks.map((l) => {
      const src = typeof l.source === 'object' ? (l.source as SimNode) : null;
      const tgt = typeof l.target === 'object' ? (l.target as SimNode) : null;
      return {
        sourceId: src ? src.id : (l.source as string),
        targetId: tgt ? tgt.id : (l.target as string),
        sourceX: src?.x ?? 0,
        sourceY: src?.y ?? 0,
        targetX: tgt?.x ?? 0,
        targetY: tgt?.y ?? 0,
      };
    });
  });
</script>

<div bind:clientWidth={width} bind:clientHeight={height} style="width: 100%; height: 100%;">
  <svg
    bind:this={svgEl}
    style="width: 100%; height: 100%; display: block; background: #0f172a;"
    onclick={() => { focusedTaskId = null; }}
  >
    <g transform="translate({transform.x}, {transform.y}) scale({transform.k})">
      {#each displayLinks as link (link.sourceId + '-' + link.targetId)}
        <GraphEdge
          sourceX={link.sourceX}
          sourceY={link.sourceY}
          targetX={link.targetX}
          targetY={link.targetY}
          highlighted={focusedTaskId !== null && (link.sourceId === focusedTaskId || link.targetId === focusedTaskId)}
          dimmed={focusedTaskId !== null && link.sourceId !== focusedTaskId && link.targetId !== focusedTaskId}
          color={focusedTaskId !== null && (link.sourceId === focusedTaskId || link.targetId === focusedTaskId) ? focusedStatusColor : '#475569'}
          visible={visibleNodeSet === null || (visibleNodeSet.has(link.sourceId) && visibleNodeSet.has(link.targetId))}
        />
      {/each}

      {#each displayNodes as node (node.id)}
        <GraphNode
          {node}
          focused={node.id === focusedTaskId}
          dimmed={focusedTaskId !== null && !connectedIds.has(node.id)}
          visible={visibleNodeSet === null || visibleNodeSet.has(node.id)}
          onfocus={(id) => { focusedTaskId = id; }}
          onhoverstart={(id, event) => { hoveredTaskId = id; mouseX = event.clientX; mouseY = event.clientY; }}
          onhoverend={() => { hoveredTaskId = null; }}
        />
      {/each}
    </g>
  </svg>

  <Sidebar task={focusedTask} {graph} />
  <Tooltip task={hoveredTask} x={mouseX} y={mouseY} />
  <Toolbar />
</div>
