<script lang="ts">
  import type { ToolFeedbackDetail } from '../chat/toolFeedback.js';
  import { getStatusColor, getStatusEmoji } from '../status.js';

  let {
    detail,
    name,
    result,
    isError,
  }: {
    detail: ToolFeedbackDetail;
    name: string;
    result: string;
    isError: boolean;
  } = $props();

  let expanded = $state(false);
</script>

<div class="tool-card" class:tool-card-error={isError}>
  <!-- Header: tool name + toggle -->
  <button
    class="tool-card-header"
    onclick={() => {
      expanded = !expanded;
    }}
    aria-expanded={expanded}
    aria-label="Toggle tool details"
  >
    <span class="tool-label tool-name">{name}</span>
    <span class="tool-chevron" class:tool-chevron-open={expanded}>▸</span>
  </button>

  <!-- Structured content based on detail kind -->
  <div class="tool-card-body">
    {#if detail.kind === 'add_task'}
      <div class="tool-row">
        <span class="tool-badge">{detail.id}</span>
        <span class="tool-text">{detail.shortName}</span>
      </div>
      <div class="tool-row">
        <span
          class="status-pill"
          style="background: {getStatusColor(detail.status)}"
        >
          {getStatusEmoji(detail.status)}
          {detail.status}
        </span>
      </div>
      {#if detail.dependencies.length > 0}
        <div class="tool-deps">
          <span class="tool-deps-label">deps:</span>
          {#each detail.dependencies as dep (dep)}
            <span class="tool-dep-badge">{dep}</span>
          {/each}
        </div>
      {/if}
    {:else if detail.kind === 'remove_task'}
      <div class="tool-row">
        <span class="tool-badge tool-badge-removed">{detail.id}</span>
        <span class="tool-text tool-text-removed">removed</span>
      </div>
    {:else if detail.kind === 'set_status'}
      <div class="tool-row">
        <span class="tool-badge">{detail.id}</span>
      </div>
      <div class="tool-row tool-status-change">
        {#if detail.oldStatus}
          <span
            class="status-pill"
            style="background: {getStatusColor(detail.oldStatus)}"
          >
            {getStatusEmoji(detail.oldStatus)}
            {detail.oldStatus}
          </span>
        {:else}
          <span class="status-pill status-pill-unknown">?</span>
        {/if}
        <span class="tool-arrow">→</span>
        <span
          class="status-pill"
          style="background: {getStatusColor(detail.newStatus)}"
        >
          {getStatusEmoji(detail.newStatus)}
          {detail.newStatus}
        </span>
      </div>
    {:else if detail.kind === 'update_task'}
      <div class="tool-row">
        <span class="tool-badge">{detail.id}</span>
        <span class="tool-text">
          updated: {detail.changedFields.join(', ')}
        </span>
      </div>
    {:else if detail.kind === 'add_dependency'}
      <div class="tool-row">
        <span class="tool-badge">{detail.taskId}</span>
        <span class="tool-arrow">→</span>
        <span class="tool-badge">{detail.dependencyId}</span>
        <span class="tool-text tool-text-added">+ edge</span>
      </div>
    {:else if detail.kind === 'remove_dependency'}
      <div class="tool-row">
        <span class="tool-badge">{detail.taskId}</span>
        <span class="tool-arrow">→</span>
        <span class="tool-badge">{detail.dependencyId}</span>
        <span class="tool-text tool-text-removed">− edge</span>
      </div>
    {:else if detail.kind === 'get_graph'}
      <div class="tool-row">
        <span class="tool-text">{detail.taskCount} tasks</span>
      </div>
    {:else if detail.kind === 'replace_graph'}
      <div class="tool-row">
        <span class="tool-text">
          Graph replaced — {detail.taskCount} tasks
        </span>
      </div>
    {:else}
      <div class="tool-row">
        <span class="tool-text">{result}</span>
      </div>
    {/if}
  </div>

  <!-- Collapsible raw result -->
  {#if expanded}
    <div class="tool-card-detail">
      <pre class="tool-raw">{result}</pre>
    </div>
  {/if}
</div>

<style>
  .tool-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    overflow: hidden;
    max-width: 90%;
  }

  .tool-card-error {
    border-color: var(--color-error-border);
  }

  .tool-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 4px 10px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-dimmed);
  }

  .tool-card-header:hover {
    background: var(--hover-bg);
  }

  .tool-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .tool-card-error .tool-label {
    color: var(--color-error);
  }

  .tool-chevron {
    font-size: 0.7rem;
    transition: transform 150ms;
  }

  .tool-chevron-open {
    transform: rotate(90deg);
  }

  .tool-card-body {
    padding: 4px 10px 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tool-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tool-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 0.75rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-weight: 500;
  }

  .tool-badge-removed {
    text-decoration: line-through;
    opacity: 0.6;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.72rem;
    font-weight: 600;
    color: #000;
  }

  .status-pill-unknown {
    background: var(--text-dimmed);
  }

  .tool-arrow {
    color: var(--text-dimmed);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .tool-status-change {
    gap: 4px;
  }

  .tool-text {
    font-size: 0.8rem;
    color: var(--text-muted);
    word-break: break-word;
  }

  .tool-text-removed {
    color: var(--color-error);
    font-weight: 500;
  }

  .tool-text-added {
    color: var(--accent-green);
    font-weight: 500;
  }

  .tool-deps {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tool-deps-label {
    font-size: 0.7rem;
    color: var(--text-dimmed);
    font-weight: 500;
  }

  .tool-dep-badge {
    display: inline-block;
    padding: 0 5px;
    border-radius: 3px;
    background: var(--bg-tertiary);
    color: var(--text-muted);
    font-size: 0.7rem;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .tool-card-detail {
    border-top: 1px solid var(--border-subtle);
    padding: 6px 10px;
  }

  .tool-raw {
    margin: 0;
    font-size: 0.72rem;
    color: var(--text-dimmed);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
</style>
