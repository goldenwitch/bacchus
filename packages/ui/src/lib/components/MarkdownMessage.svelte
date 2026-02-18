<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  let { content }: { content: string } = $props();

  // Configure marked for safe defaults
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  let rendered = $derived.by(() => {
    const raw = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  });

  let containerEl: HTMLDivElement | undefined = $state();

  // Add copy buttons to code blocks after render
  $effect(() => {
    if (!containerEl) return;
    // Force dependency on rendered content
    void rendered;

    // Wait for DOM update
    requestAnimationFrame(() => {
      const blocks = containerEl!.querySelectorAll('pre');
      for (const block of blocks) {
        if (block.querySelector('.code-copy-btn')) continue;
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.textContent = 'Copy';
        btn.setAttribute('aria-label', 'Copy code');
        btn.addEventListener('click', () => {
          const code = block.querySelector('code');
          const text = code?.textContent ?? block.textContent ?? '';
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => (btn.textContent = 'Copy'), 1500);
          }).catch(() => {});
        });
        block.style.position = 'relative';
        block.appendChild(btn);
      }
    });
  });
</script>

<div class="markdown-body" bind:this={containerEl}>
  {@html rendered}
</div>

<style>
  .markdown-body {
    line-height: 1.5;
    word-break: break-word;
  }

  .markdown-body :global(p) {
    margin: 0.4em 0;
  }

  .markdown-body :global(p:first-child) {
    margin-top: 0;
  }

  .markdown-body :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-body :global(pre) {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    padding: 0.75em 1em;
    overflow-x: auto;
    margin: 0.5em 0;
    position: relative;
  }

  .markdown-body :global(code) {
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.88em;
  }

  .markdown-body :global(:not(pre) > code) {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
    padding: 0.15em 0.35em;
  }

  .markdown-body :global(pre code) {
    background: none;
    padding: 0;
    font-size: 0.85em;
  }

  .markdown-body :global(ul),
  .markdown-body :global(ol) {
    margin: 0.4em 0;
    padding-left: 1.5em;
  }

  .markdown-body :global(li) {
    margin: 0.15em 0;
  }

  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3),
  .markdown-body :global(h4) {
    margin: 0.6em 0 0.3em;
    font-weight: 600;
  }

  .markdown-body :global(h1) { font-size: 1.3em; }
  .markdown-body :global(h2) { font-size: 1.15em; }
  .markdown-body :global(h3) { font-size: 1.05em; }

  .markdown-body :global(blockquote) {
    border-left: 3px solid rgba(255, 255, 255, 0.3);
    margin: 0.4em 0;
    padding: 0.2em 0.8em;
    opacity: 0.85;
  }

  .markdown-body :global(table) {
    border-collapse: collapse;
    margin: 0.5em 0;
    width: 100%;
  }

  .markdown-body :global(th),
  .markdown-body :global(td) {
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 0.35em 0.6em;
    text-align: left;
  }

  .markdown-body :global(th) {
    background: rgba(0, 0, 0, 0.15);
    font-weight: 600;
  }

  .markdown-body :global(hr) {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    margin: 0.8em 0;
  }

  .markdown-body :global(.code-copy-btn) {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: inherit;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 0.75em;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .markdown-body :global(pre:hover .code-copy-btn) {
    opacity: 1;
  }

  .markdown-body :global(.code-copy-btn:hover) {
    background: rgba(255, 255, 255, 0.25);
  }
</style>
