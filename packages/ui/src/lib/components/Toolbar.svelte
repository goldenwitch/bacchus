<script lang="ts">
  import MuteButton from './MuteButton.svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  let {
    onreset,
    graphTitle,
    onzoomin,
    onzoomout,
    onfitview,
    zoomLevel,
    svgElement,
    onchat,
    chatOpen,
  }: {
    onreset?: () => void;
    graphTitle?: string;
    onzoomin?: () => void;
    onzoomout?: () => void;
    onfitview?: () => void;
    zoomLevel?: number;
    svgElement?: SVGSVGElement;
    onchat?: () => void;
    chatOpen?: boolean;
  } = $props();

  function resolveVarReferences(el: Element): void {
    // Resolve CSS var() in presentation attributes
    const attrs = el.attributes;
    const style = getComputedStyle(document.documentElement);
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      if (attr.value.includes('var(')) {
        const resolved = attr.value.replace(/var\(--[\w-]+\)/g, (match) => {
          const prop = match.slice(4, -1); // extract --prop-name
          return style.getPropertyValue(prop).trim() || match;
        });
        el.setAttribute(attr.name, resolved);
      }
    }
    // Also resolve inline style var() references
    const inlineStyle = el.getAttribute('style');
    if (inlineStyle?.includes('var(')) {
      const resolved = inlineStyle.replace(/var\(--[\w-]+\)/g, (match) => {
        const prop = match.slice(4, -1);
        return style.getPropertyValue(prop).trim() || match;
      });
      el.setAttribute('style', resolved);
    }
    for (const child of el.children) {
      resolveVarReferences(child);
    }
  }

  function exportSVG() {
    if (!svgElement) return;
    const clone = svgElement.cloneNode(true) as SVGSVGElement;
    // Resolve all CSS var() references so the SVG is portable
    resolveVarReferences(clone);
    const bgRect = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'rect',
    );
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute(
      'fill',
      getComputedStyle(document.documentElement)
        .getPropertyValue('--bg-primary')
        .trim(),
    );
    clone.insertBefore(bgRect, clone.firstChild);
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graph.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>

<div class="toolbar">
  {#if onreset}
    <button
      class="home-btn"
      onclick={onreset}
      aria-label="Return to home screen"
      title="Load new file"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 12L12 3l9 9" />
        <path d="M9 21V12h6v9" />
      </svg>
    </button>
  {/if}
  {#if graphTitle}
    <span class="graph-title" title={graphTitle}>{graphTitle}</span>
  {/if}
  {#if onzoomout}
    <button
      class="home-btn"
      onclick={onzoomout}
      aria-label="Zoom out"
      title="Zoom out"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    </button>
  {/if}
  {#if onzoomin}
    <button
      class="home-btn"
      onclick={onzoomin}
      aria-label="Zoom in"
      title="Zoom in"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    </button>
  {/if}
  {#if zoomLevel !== undefined}
    <span class="zoom-level">{Math.round(zoomLevel * 100)}%</span>
  {/if}
  {#if onfitview}
    <button
      class="home-btn"
      onclick={onfitview}
      aria-label="Fit graph to view"
      title="Fit to view"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M15 3h6v6" />
        <path d="M9 21H3v-6" />
        <path d="M21 3l-7 7" />
        <path d="M3 21l7-7" />
      </svg>
    </button>
  {/if}
  {#if svgElement}
    <button
      class="home-btn"
      onclick={exportSVG}
      aria-label="Export graph as SVG"
      title="Export as SVG"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </button>
  {/if}
  {#if onchat}
    <button
      class="home-btn"
      class:chat-active={chatOpen}
      onclick={onchat}
      aria-label={chatOpen ? 'Close chat planner' : 'Open chat planner'}
      title={chatOpen ? 'Close chat' : 'Chat planner'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        />
      </svg>
    </button>
  {/if}
  <ThemeToggle />
  <MuteButton />
</div>

<style>
  .toolbar {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 150;
    display: flex;
    gap: 8px;
    align-items: center;
    background: var(--toolbar-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
    border-radius: 24px;
    padding: 6px 12px;
  }

  .home-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 6px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .home-btn:hover {
    opacity: 0.8;
  }

  .chat-active {
    color: var(--accent-green);
  }

  .zoom-level {
    color: var(--text-muted);
    font-size: 0.7rem;
    min-width: 36px;
    text-align: center;
    user-select: none;
  }

  .graph-title {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
    margin: 0 auto;
  }
</style>
