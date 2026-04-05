<script lang="ts">
  import type { Task, Status, VineGraph, Attachment, AttachmentClass } from '@bacchus/core';
  import {
    getDependencies,
    getDependants,
    getDescendants,
    getSpriteUri,
    setStatus,
    updateTask,
    addDependency,
    applyBatch,
    removeDependency,
    VALID_STATUSES,
  } from '@bacchus/core';
  import { fly } from 'svelte/transition';
  import { quintOut, quintIn } from 'svelte/easing';
  import { STATUS_MAP } from '../status.js';

  let {
    task,
    graph,
    onclose,
    onfocus,
    onmutate,
  }: {
    task: Task | null;
    graph: VineGraph;
    onclose?: () => void;
    onfocus?: (taskId: string) => void;
    onmutate?: (graph: VineGraph) => void;
  } = $props();

  const editable = $derived(!!onmutate);

  const statusInfo = $derived(
    task && task.kind === 'task' ? STATUS_MAP[task.status] : null,
  );
  const deps = $derived(task ? getDependencies(graph, task.id) : []);
  const dependants = $derived(task ? getDependants(graph, task.id) : []);
  const spriteUri = $derived(task ? getSpriteUri(task) : undefined);

  // ── Inline editing state ──────────────────────────────────────────────
  let editingName = $state(false);
  let editingDescription = $state(false);
  let editingDecisionIndex = $state<number | null>(null);
  let addingDecision = $state(false);
  let newDecisionText = $state('');
  let addingDep = $state(false);
  let depQuery = $state('');
  let addingAttachment = $state(false);
  let newAttClass = $state<AttachmentClass>('artifact');
  let newAttMime = $state('');
  let newAttUri = $state('');
  let addingNode = $state(false);
  let addingDepChoice = $state(false);
  let addingDepNode = $state(false);
  let newNodeId = $state('');
  let newNodeName = $state('');
  let newNodeDescription = $state('');
  let newNodeStatus = $state<Status>('notstarted');
  let newNodeIdTouched = $state(false);
  let errorMessage = $state<string | null>(null);
  let errorTimeout: ReturnType<typeof setTimeout> | null = null;

  // Name/description debounce timers
  let nameTimer: ReturnType<typeof setTimeout> | null = null;
  let descTimer: ReturnType<typeof setTimeout> | null = null;

  // Reset editing state when focusedTask changes
  $effect(() => {
    // Read task to establish dependency
    void task;
    editingName = false;
    editingDescription = false;
    editingDecisionIndex = null;
    addingDecision = false;
    newDecisionText = '';
    addingDep = false;
    depQuery = '';
    addingAttachment = false;
    newAttClass = 'artifact';
    newAttMime = '';
    newAttUri = '';
    addingNode = false;
    addingDepChoice = false;
    addingDepNode = false;
    newNodeId = '';
    newNodeName = '';
    newNodeDescription = '';
    newNodeStatus = 'notstarted';
    newNodeIdTouched = false;
    clearError();
  });

  // Candidate deps for the autocomplete picker (exclude existing deps, self, and ancestors that would cause cycles)
  const depCandidates = $derived.by(() => {
    if (!task) return [];
    const descendants = getDescendants(graph, task.id);
    const excludeIds = new Set([...task.dependencies, task.id, ...descendants.map((t) => t.id)]);
    return [...graph.tasks.values()]
      .filter((t) => !excludeIds.has(t.id))
      .filter(
        (t) =>
          !depQuery ||
          t.id.toLowerCase().includes(depQuery.toLowerCase()) ||
          t.shortName.toLowerCase().includes(depQuery.toLowerCase()),
      );
  });

  // ── Error toast helpers ───────────────────────────────────────────────
  function showError(msg: string) {
    errorMessage = msg;
    if (errorTimeout) clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => {
      errorMessage = null;
      errorTimeout = null;
    }, 4000);
  }

  function clearError() {
    errorMessage = null;
    if (errorTimeout) {
      clearTimeout(errorTimeout);
      errorTimeout = null;
    }
  }

  // ── Mutation helpers (catch errors and show toast) ────────────────────
  function tryMutate(fn: () => VineGraph) {
    try {
      const updated = fn();
      onmutate?.(updated);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleStatusChange(e: Event & { currentTarget: HTMLSelectElement }) {
    if (!task || task.kind !== 'task') return;
    const id = task.id;
    const newStatus: Status = e.currentTarget.value as Status;
    tryMutate(() => setStatus(graph, id, newStatus));
  }

  function handleNameCommit(e: Event & { currentTarget: HTMLInputElement }) {
    if (!task) return;
    const id = task.id;
    const value = e.currentTarget.value.trim();
    if (!value || value === task.shortName) {
      editingName = false;
      return;
    }
    tryMutate(() => updateTask(graph, id, { shortName: value }));
    editingName = false;
  }

  function handleDescriptionCommit(e: Event & { currentTarget: HTMLTextAreaElement }) {
    if (!task) return;
    const id = task.id;
    const value = e.currentTarget.value;
    if (value === task.description) {
      editingDescription = false;
      return;
    }
    tryMutate(() => updateTask(graph, id, { description: value }));
    editingDescription = false;
  }

  function handleDecisionEdit(index: number, newText: string) {
    if (!task) return;
    const id = task.id;
    const updated = [...task.decisions];
    if (!newText.trim()) {
      // Empty → delete the decision
      updated.splice(index, 1);
    } else {
      updated[index] = newText;
    }
    tryMutate(() => updateTask(graph, id, { decisions: updated }));
    editingDecisionIndex = null;
  }

  function handleAddDecision() {
    if (!task || !newDecisionText.trim()) return;
    const id = task.id;
    const updated = [...task.decisions, newDecisionText.trim()];
    tryMutate(() => updateTask(graph, id, { decisions: updated }));
    newDecisionText = '';
    addingDecision = false;
  }

  function handleAddDep(depId: string) {
    if (!task) return;
    const id = task.id;
    tryMutate(() => addDependency(graph, id, depId));
    addingDep = false;
    depQuery = '';
  }

  function handleRemoveDep(depId: string) {
    if (!task) return;
    const id = task.id;
    tryMutate(() => removeDependency(graph, id, depId));
  }

  function handleRemoveAttachment(index: number) {
    if (!task || task.kind !== 'task') return;
    const id = task.id;
    const updated = task.attachments.filter((_, i) => i !== index);
    tryMutate(() => updateTask(graph, id, { attachments: [...updated] }));
  }

  function handleAddAttachment() {
    if (!task || task.kind !== 'task' || !newAttUri.trim()) return;
    const id = task.id;
    const newAtt: Attachment = {
      class: newAttClass,
      mime: newAttMime.trim() || 'application/octet-stream',
      uri: newAttUri.trim(),
    };
    const updated = [...task.attachments, newAtt];
    tryMutate(() => updateTask(graph, id, { attachments: updated }));
    addingAttachment = false;
    newAttClass = 'artifact';
    newAttMime = '';
    newAttUri = '';
  }

  // ── Slugify helper ────────────────────────────────────────────────────
  function slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function resetNewNodeForm() {
    newNodeId = '';
    newNodeName = '';
    newNodeDescription = '';
    newNodeStatus = 'notstarted';
    newNodeIdTouched = false;
  }

  // ── Add new node (standalone) ─────────────────────────────────────────
  function handleAddNode() {
    const id = newNodeId.trim();
    const name = newNodeName.trim();
    if (!id || !name) {
      showError('Node ID and name are required.');
      return;
    }
    if (graph.tasks.has(id)) {
      showError(`A task with ID "${id}" already exists.`);
      return;
    }
    tryMutate(() => {
      const rootId = graph.order[0];
      const ops = [
        { op: 'add_task' as const, id, name, status: newNodeStatus, description: newNodeDescription.trim() },
        ...(rootId && rootId !== id ? [{ op: 'add_dep' as const, taskId: rootId, depId: id }] : []),
      ];
      return applyBatch(graph, ops);
    });
    addingNode = false;
    resetNewNodeForm();
    onfocus?.(id);
  }

  // ── Add new node as dependency ────────────────────────────────────────
  function handleAddDepNode() {
    if (!task) return;
    const parentId = task.id;
    const id = newNodeId.trim();
    const name = newNodeName.trim();
    if (!id || !name) {
      showError('Node ID and name are required.');
      return;
    }
    if (graph.tasks.has(id)) {
      showError(`A task with ID "${id}" already exists.`);
      return;
    }
    tryMutate(() => {
      return applyBatch(graph, [
        { op: 'add_task', id, name, status: newNodeStatus, description: newNodeDescription.trim() },
        { op: 'add_dep', taskId: parentId, depId: id },
      ]);
    });
    addingDepNode = false;
    addingDepChoice = false;
    resetNewNodeForm();
  }

  // Compute pill text color with proper contrast against status background
  const pillTextColor = $derived.by(() => {
    if (!statusInfo) return 'var(--color-node-text-dark)';
    const hex = statusInfo.color;
    if (!hex || hex.length < 7) return 'var(--color-node-text-dark)';
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 0.5
      ? 'var(--color-node-text-dark)'
      : 'var(--color-node-text-light)';
  });

  // Detect mobile for transition direction
  const isMobile =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 480px)').matches
      : false;

  let copied = $state(false);

  function copyId() {
    if (!task) return;
    navigator.clipboard.writeText(task.id).catch(() => {});
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1500);
  }
</script>

{#snippet nodeForm(onsubmit: () => void, oncancel: () => void)}
  <div class="add-node-form">
    <div class="add-node-row">
      <label class="add-node-label" for="new-node-name">Name</label>
      <input
        id="new-node-name"
        class="add-node-input"
        type="text"
        placeholder="e.g. Setup Database"
        autofocus
        bind:value={newNodeName}
        oninput={() => {
          if (!newNodeIdTouched) {
            newNodeId = slugify(newNodeName);
          }
        }}
        onkeydown={(e) => {
          if (e.key === 'Escape') oncancel();
        }}
      />
    </div>
    <div class="add-node-row">
      <label class="add-node-label" for="new-node-id">ID</label>
      <input
        id="new-node-id"
        class="add-node-input add-node-id-input"
        type="text"
        placeholder="e.g. setup-database"
        bind:value={newNodeId}
        oninput={() => { newNodeIdTouched = true; }}
        onkeydown={(e) => {
          if (e.key === 'Escape') oncancel();
        }}
      />
    </div>
    <div class="add-node-row">
      <label class="add-node-label" for="new-node-desc">Desc</label>
      <textarea
        id="new-node-desc"
        class="add-node-textarea"
        rows="2"
        placeholder="Optional description…"
        bind:value={newNodeDescription}
        onkeydown={(e) => {
          if (e.key === 'Escape') oncancel();
        }}
      ></textarea>
    </div>
    <div class="add-node-row">
      <label class="add-node-label" for="new-node-status">Status</label>
      <select
        id="new-node-status"
        class="add-node-select"
        bind:value={newNodeStatus}
      >
        {#each VALID_STATUSES as s (s)}
          <option value={s}>{STATUS_MAP[s].emoji} {STATUS_MAP[s].label}</option>
        {/each}
      </select>
    </div>
    <div class="add-node-actions">
      <button class="add-node-confirm" onclick={onsubmit}>Create</button>
      <button class="add-node-cancel" onclick={oncancel}>Cancel</button>
    </div>
  </div>
{/snippet}

{#if task}
  <aside
    class="sidebar"
    role="region"
    aria-label="Task details"
    in:fly={{
      x: isMobile ? 0 : 360,
      y: isMobile ? 300 : 0,
      duration: 300,
      easing: quintOut,
    }}
    out:fly={{
      x: isMobile ? 0 : 360,
      y: isMobile ? 300 : 0,
      duration: 200,
      easing: quintIn,
    }}
    onclick={(e: MouseEvent) => e.stopPropagation()}
    onkeydown={(e: KeyboardEvent) => {
      if (e.key === 'Escape') onclose?.();
    }}
  >
    {#if onclose}
      <button class="close-btn" aria-label="Close sidebar" onclick={onclose}
        >✕</button
      >
    {/if}

    <!-- Error toast -->
    {#if errorMessage}
      <div class="error-toast" role="alert">
        <span class="error-icon">⚠️</span>
        <span class="error-text">{errorMessage}</span>
        <button class="error-dismiss" onclick={clearError}>✕</button>
      </div>
    {/if}

    <!-- Status: dropdown when editable, pill when read-only -->
    {#if statusInfo}
      {#if editable && task.kind === 'task'}
        <div class="status-edit-row">
          <span class="status-edit-emoji">{statusInfo.emoji}</span>
          <select
            class="status-select"
            value={task.status}
            onchange={handleStatusChange}
            style="border-color: {statusInfo.color};"
          >
            {#each VALID_STATUSES as s (s)}
              <option value={s}>{STATUS_MAP[s].emoji} {STATUS_MAP[s].label}</option>
            {/each}
          </select>
        </div>
      {:else}
        <span
          class="status-pill"
          style="background: {statusInfo.color}; color: {pillTextColor};"
        >
          {statusInfo.emoji}
          {statusInfo.label}
        </span>
      {/if}
    {/if}

    <!-- Short name: click-to-edit input when editable -->
    {#if editable && editingName}
      <input
        class="heading-input"
        type="text"
        value={task.shortName}
        autofocus
        onblur={handleNameCommit}
        onkeydown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { editingName = false; }
        }}
      />
    {:else}
      <h2
        class="heading"
        class:heading-editable={editable}
        onclick={() => { if (editable) editingName = true; }}
        role={editable ? 'button' : undefined}
        tabindex={editable ? 0 : undefined}
        onkeydown={(e) => { if (editable && e.key === 'Enter') editingName = true; }}
      >{task.shortName}</h2>
    {/if}

    <!-- Description: click-to-edit textarea when editable -->
    {#if editable && editingDescription}
      <textarea
        class="description-input"
        autofocus
        rows="4"
        onblur={handleDescriptionCommit}
        onkeydown={(e) => {
          if (e.key === 'Escape') { editingDescription = false; }
        }}
      >{task.description}</textarea>
    {:else}
      <p
        class="description"
        class:description-editable={editable}
        onclick={() => { if (editable) editingDescription = true; }}
        role={editable ? 'button' : undefined}
        tabindex={editable ? 0 : undefined}
        onkeydown={(e) => { if (editable && e.key === 'Enter') editingDescription = true; }}
      >{task.description || (editable ? 'Click to add description…' : '')}</p>
    {/if}

    <!-- Decisions: editable list with add button -->
    {#if task.decisions.length > 0 || editable}
      <div class="decisions">
        <h3 class="section-heading">Decisions</h3>
        <ul>
          {#each task.decisions as decision, i (i)}
            {#if editable && editingDecisionIndex === i}
              <li class="decision-edit-li">
                <input
                  class="decision-input"
                  type="text"
                  value={decision}
                  autofocus
                  onblur={(e) => handleDecisionEdit(i, e.currentTarget.value)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') { editingDecisionIndex = null; }
                  }}
                />
                <button
                  class="decision-delete-btn"
                  aria-label="Delete decision"
                  onclick={() => handleDecisionEdit(i, '')}
                >✕</button>
              </li>
            {:else}
              <li
                class:decision-editable={editable}
                onclick={() => { if (editable) editingDecisionIndex = i; }}
                role={editable ? 'button' : undefined}
                tabindex={editable ? 0 : undefined}
                onkeydown={(e) => { if (editable && e.key === 'Enter') editingDecisionIndex = i; }}
              >{decision}</li>
            {/if}
          {/each}
        </ul>
        {#if editable}
          {#if addingDecision}
            <div class="add-decision-row">
              <input
                class="decision-input"
                type="text"
                placeholder="New decision…"
                autofocus
                bind:value={newDecisionText}
                onkeydown={(e) => {
                  if (e.key === 'Enter') handleAddDecision();
                  if (e.key === 'Escape') { addingDecision = false; newDecisionText = ''; }
                }}
              />
              <button class="add-decision-confirm" onclick={handleAddDecision}>✓</button>
            </div>
          {:else}
            <button class="add-btn" onclick={() => { addingDecision = true; }}>
              + Add decision
            </button>
          {/if}
        {/if}
      </div>
    {/if}

    {#if spriteUri}
      <div class="sidebar-section">
        <h3 class="sidebar-heading">Custom Sprite</h3>
        <p class="sprite-uri">🎨 {spriteUri}</p>
      </div>
    {/if}

    {#if task.kind === 'task' && (task.attachments?.length || editable)}
      <div class="sidebar-section">
        <h3 class="sidebar-heading">Attachments</h3>
        {#if task.attachments?.length}
          <ul class="attachment-list">
            {#each task.attachments as att, i (att.uri + i)}
              <li class="attachment-item">
                <span class="attachment-icon">
                  {att.class === 'artifact'
                    ? '📦'
                    : att.class === 'guidance'
                      ? '📘'
                      : '📄'}
                </span>
                <span class="attachment-class"
                  >{att.class.charAt(0).toUpperCase() + att.class.slice(1)}</span
                >
                <span class="attachment-mime">{att.mime}</span>
                <a
                  class="attachment-uri"
                  href={att.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {att.uri.length > 45 ? '…' + att.uri.slice(-42) : att.uri}
                </a>
                {#if editable}
                  <button
                    class="attachment-remove-btn"
                    aria-label="Remove attachment"
                    onclick={() => handleRemoveAttachment(i)}
                  >✕</button>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <span class="dep-empty">None</span>
        {/if}
        {#if editable}
          {#if addingAttachment}
            <div class="add-attachment-form">
              <div class="add-attachment-row">
                <label class="add-attachment-label">Class</label>
                <select class="add-attachment-select" bind:value={newAttClass}>
                  <option value="artifact">📦 Artifact</option>
                  <option value="guidance">📘 Guidance</option>
                  <option value="file">📄 File</option>
                </select>
              </div>
              <div class="add-attachment-row">
                <label class="add-attachment-label">MIME</label>
                <input
                  class="add-attachment-input"
                  type="text"
                  placeholder="e.g. application/pdf"
                  bind:value={newAttMime}
                />
              </div>
              <div class="add-attachment-row">
                <label class="add-attachment-label">URI</label>
                <input
                  class="add-attachment-input"
                  type="text"
                  placeholder="e.g. ./report.pdf"
                  autofocus
                  bind:value={newAttUri}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') handleAddAttachment();
                    if (e.key === 'Escape') { addingAttachment = false; newAttMime = ''; newAttUri = ''; }
                  }}
                />
              </div>
              <div class="add-attachment-actions">
                <button class="add-decision-confirm" onclick={handleAddAttachment}>Add</button>
                <button class="attachment-cancel-btn" onclick={() => { addingAttachment = false; newAttMime = ''; newAttUri = ''; }}>Cancel</button>
              </div>
            </div>
          {:else}
            <button class="add-btn" onclick={() => { addingAttachment = true; }}>
              + Add attachment
            </button>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Dependencies: with remove (✕) and add (+) when editable -->
    <div class="dep-section">
      <h3 class="section-heading">Depends on</h3>
      {#if deps.length === 0 && !editable}
        <span class="dep-empty">None</span>
      {:else}
        {#each deps as dep (dep.id)}
          <div class="dep-row">
            <button class="dep-item" onclick={() => onfocus?.(dep.id)}>
              <span
                >{dep.kind === 'task'
                  ? STATUS_MAP[dep.status].emoji
                  : '🔗'}</span
              >
              <span>{dep.shortName}</span>
            </button>
            {#if editable}
              <button
                class="dep-remove-btn"
                aria-label="Remove dependency on {dep.shortName}"
                onclick={() => handleRemoveDep(dep.id)}
              >✕</button>
            {/if}
          </div>
        {/each}
        {#if deps.length === 0 && editable}
          <span class="dep-empty">None</span>
        {/if}
      {/if}
      {#if editable}
        {#if addingDep}
          <div class="add-dep-picker">
            <input
              class="dep-search-input"
              type="text"
              placeholder="Search tasks…"
              autofocus
              bind:value={depQuery}
              onkeydown={(e) => {
                if (e.key === 'Escape') { addingDep = false; depQuery = ''; addingDepChoice = false; }
              }}
            />
            <div class="dep-candidate-list">
              {#each depCandidates.slice(0, 8) as candidate (candidate.id)}
                <button
                  class="dep-candidate"
                  onclick={() => handleAddDep(candidate.id)}
                >
                  <span>{candidate.kind === 'task' ? STATUS_MAP[candidate.status].emoji : '🔗'}</span>
                  <span class="dep-candidate-name">{candidate.shortName}</span>
                  <span class="dep-candidate-id">{candidate.id}</span>
                </button>
              {/each}
              {#if depCandidates.length === 0}
                <span class="dep-empty">No matching tasks</span>
              {/if}
            </div>
            <button class="dep-choice-cancel" onclick={() => { addingDep = false; depQuery = ''; addingDepChoice = false; }}>
              Cancel
            </button>
          </div>
        {:else if addingDepNode}
          {@render nodeForm(handleAddDepNode, () => { addingDepNode = false; addingDepChoice = false; resetNewNodeForm(); })}
        {:else if addingDepChoice}
          <div class="dep-choice-panel">
            <button class="dep-choice-btn" onclick={() => { addingDep = true; addingDepChoice = false; }}>
              🔗 Pick existing node
            </button>
            <button class="dep-choice-btn" onclick={() => { addingDepNode = true; addingDepChoice = false; }}>
              ✨ Create new node
            </button>
            <button class="dep-choice-cancel" onclick={() => { addingDepChoice = false; }}>
              Cancel
            </button>
          </div>
        {:else}
          <button class="add-btn" onclick={() => { addingDepChoice = true; }}>
            + Add new dependency
          </button>
        {/if}
      {/if}
    </div>

    <div class="dep-section">
      <h3 class="section-heading">Depended on by</h3>
      {#if dependants.length === 0}
        <span class="dep-empty">None</span>
      {:else}
        {#each dependants as dep (dep.id)}
          <button class="dep-item" onclick={() => onfocus?.(dep.id)}>
            <span
              >{dep.kind === 'task' ? STATUS_MAP[dep.status].emoji : '🔗'}</span
            >
            <span>{dep.shortName}</span>
          </button>
        {/each}
      {/if}
    </div>

    <!-- Add new node (standalone) -->
    {#if editable}
      <div class="dep-section">
        <h3 class="section-heading">Actions</h3>
        {#if addingNode}
          {@render nodeForm(handleAddNode, () => { addingNode = false; resetNewNodeForm(); })}
        {:else}
          <button class="add-btn" onclick={() => { addingNode = true; }}>
            + Add new node
          </button>
        {/if}
      </div>
    {/if}

    <div class="watermark">
      <span class="watermark-id">{task.id}</span>
      <button class="copy-btn" aria-label="Copy task ID" onclick={copyId}>
        {#if copied}
          <span class="copied-flash">Copied!</span>
        {:else}
          📋
        {/if}
      </button>
    </div>
  </aside>
{/if}

<style>
  .sidebar {
    position: fixed;
    top: 56px;
    right: 0;
    width: min(360px, calc(100vw - 48px));
    height: calc(100vh - 56px);
    max-height: calc(100vh - 56px);
    background: var(--sidebar-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-left: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    padding: 24px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .close-btn {
    position: absolute;
    top: -4px;
    right: 12px;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    z-index: 1;
  }

  .close-btn:hover {
    color: var(--text-secondary);
    background: var(--hover-bg-strong);
  }

  /* ── Error toast ──────────────────────────────────────────────────── */
  .error-toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(220, 63, 82, 0.15);
    border: 1px solid rgba(220, 63, 82, 0.4);
    border-radius: 8px;
    font-size: 0.8rem;
    color: #f87171;
    animation: toast-in 0.2s ease-out;
  }

  .error-icon {
    flex-shrink: 0;
  }

  .error-text {
    flex: 1;
    line-height: 1.3;
  }

  .error-dismiss {
    background: none;
    border: none;
    color: #f87171;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .error-dismiss:hover {
    background: rgba(220, 63, 82, 0.2);
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Status editing ───────────────────────────────────────────────── */
  .status-pill {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.85rem;
    font-weight: 600;
    width: fit-content;
  }

  .status-edit-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-edit-emoji {
    font-size: 1.1rem;
  }

  .status-select {
    flex: 1;
    padding: 4px 8px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: var(--hover-bg);
    color: var(--text-primary);
    font-size: 0.85rem;
    font-family: inherit;
    cursor: pointer;
    outline: none;
  }

  .status-select:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  /* ── Name editing ─────────────────────────────────────────────────── */
  .heading {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .heading-editable {
    cursor: pointer;
    border-radius: 4px;
    padding: 2px 4px;
    margin: -2px -4px;
  }

  .heading-editable:hover {
    background: var(--hover-bg);
  }

  .heading-input {
    width: 100%;
    font-size: 1.25rem;
    font-weight: 700;
    font-family: inherit;
    color: var(--text-primary);
    background: var(--hover-bg);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 4px 8px;
    outline: none;
    box-sizing: border-box;
  }

  .heading-input:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  /* ── Description editing ──────────────────────────────────────────── */
  .description {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-tertiary);
  }

  .description-editable {
    cursor: pointer;
    border-radius: 4px;
    padding: 4px;
    margin: -4px;
    min-height: 1.5em;
  }

  .description-editable:hover {
    background: var(--hover-bg);
  }

  .description-input {
    width: 100%;
    font-size: 0.9rem;
    font-family: inherit;
    line-height: 1.5;
    color: var(--text-tertiary);
    background: var(--hover-bg);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 6px 8px;
    outline: none;
    resize: vertical;
    min-height: 60px;
    box-sizing: border-box;
  }

  .description-input:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  /* ── Decisions editing ────────────────────────────────────────────── */
  .decisions {
    margin-top: 8px;
  }

  .section-heading {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-dimmed);
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 6px;
    margin: 16px 0 8px 0;
  }

  .decisions ul {
    margin: 0;
    padding-left: 20px;
  }

  .decisions li {
    font-size: 0.85rem;
    color: var(--text-tertiary);
    margin-bottom: 4px;
  }

  .decision-editable {
    cursor: pointer;
    border-radius: 4px;
    padding: 2px 4px;
    margin: -2px -4px;
  }

  .decision-editable:hover {
    background: var(--hover-bg);
  }

  .decision-edit-li {
    display: flex;
    align-items: center;
    gap: 4px;
    list-style: none;
    margin-left: -20px;
    margin-bottom: 4px;
  }

  .decision-input {
    flex: 1;
    font-size: 0.85rem;
    font-family: inherit;
    color: var(--text-tertiary);
    background: var(--hover-bg);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    padding: 3px 6px;
    outline: none;
  }

  .decision-input:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  .decision-delete-btn {
    background: none;
    border: none;
    color: var(--text-dimmed);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .decision-delete-btn:hover {
    color: #f87171;
    background: rgba(220, 63, 82, 0.15);
  }

  .add-decision-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
  }

  .add-decision-confirm {
    background: none;
    border: none;
    color: var(--accent-green, #50C878);
    cursor: pointer;
    font-size: 1rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .add-decision-confirm:hover {
    background: rgba(80, 200, 120, 0.15);
  }

  .add-btn {
    background: none;
    border: 1px dashed var(--border-subtle);
    color: var(--text-dimmed);
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
    padding: 4px 10px;
    border-radius: 6px;
    margin-top: 6px;
    width: 100%;
    text-align: left;
  }

  .add-btn:hover {
    border-color: var(--color-accent, #60a5fa);
    color: var(--text-tertiary);
    background: var(--hover-bg);
  }

  /* ── Dependency editing ───────────────────────────────────────────── */
  .dep-section {
    margin-top: 0;
  }

  .dep-row {
    display: flex;
    align-items: center;
  }

  .dep-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-tertiary);
    background: none;
    border: none;
    flex: 1;
    text-align: left;
    font-family: inherit;
  }

  .dep-item:hover {
    background: var(--hover-bg);
  }

  .dep-remove-btn {
    background: none;
    border: none;
    color: var(--text-dimmed);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 4px 6px;
    border-radius: 4px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .dep-row:hover .dep-remove-btn {
    opacity: 1;
  }

  .dep-remove-btn:hover {
    color: #f87171;
    background: rgba(220, 63, 82, 0.15);
  }

  .add-dep-picker {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dep-search-input {
    width: 100%;
    font-size: 0.85rem;
    font-family: inherit;
    color: var(--text-primary);
    background: var(--hover-bg);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 6px 8px;
    outline: none;
    box-sizing: border-box;
  }

  .dep-search-input:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  .dep-candidate-list {
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dep-candidate {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-tertiary);
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
  }

  .dep-candidate:hover {
    background: var(--hover-bg);
  }

  .dep-candidate-name {
    flex: 1;
  }

  .dep-candidate-id {
    font-size: 0.7rem;
    color: var(--text-dimmed);
    font-family: monospace;
  }

  .dep-empty {
    font-size: 0.8rem;
    color: var(--text-dimmed);
    padding: 4px 8px;
  }

  /* ── Watermark ────────────────────────────────────────────────────── */
  .watermark {
    position: absolute;
    bottom: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    opacity: 0.35;
    color: var(--text-secondary);
  }

  .watermark-id {
    user-select: all;
  }

  .copy-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.7rem;
    padding: 2px 4px;
    border-radius: 4px;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .copy-btn:hover {
    opacity: 1;
    background: var(--hover-bg-strong);
  }

  .copied-flash {
    color: var(--accent-green);
    font-size: 0.7rem;
    font-weight: 600;
  }

  /* ── Existing sections ────────────────────────────────────────────── */
  .sidebar-section {
    margin-top: 8px;
  }

  .sidebar-heading {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-dimmed);
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 6px;
    margin: 16px 0 8px 0;
  }

  .attachment-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .attachment-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.6rem;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;
  }

  .attachment-icon {
    font-size: 1rem;
  }

  .attachment-class {
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .attachment-mime {
    font-family: monospace;
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    color: var(--text-muted);
  }

  .attachment-uri {
    font-size: 0.75rem;
    color: var(--color-accent, #60a5fa);
    text-decoration: none;
    word-break: break-all;
  }

  .attachment-uri:hover {
    text-decoration: underline;
  }

  .attachment-remove-btn {
    background: none;
    border: none;
    color: var(--text-dimmed);
    cursor: pointer;
    font-size: 0.7rem;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
    margin-left: auto;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .attachment-item:hover .attachment-remove-btn {
    opacity: 1;
  }

  .attachment-remove-btn:hover {
    color: #f87171;
    background: rgba(220, 63, 82, 0.15);
  }

  .add-attachment-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
  }

  .add-attachment-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .add-attachment-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-dimmed);
    width: 40px;
    flex-shrink: 0;
  }

  .add-attachment-select {
    flex: 1;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
    background: var(--hover-bg);
    color: var(--text-primary);
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    outline: none;
  }

  .add-attachment-select:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  .add-attachment-input {
    flex: 1;
    font-size: 0.8rem;
    font-family: inherit;
    color: var(--text-primary);
    background: var(--hover-bg);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 4px 6px;
    outline: none;
  }

  .add-attachment-input:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  .add-attachment-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .attachment-cancel-btn {
    background: none;
    border: none;
    color: var(--text-dimmed);
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .attachment-cancel-btn:hover {
    color: var(--text-tertiary);
    background: var(--hover-bg);
  }

  .sprite-uri {
    font-size: 0.8rem;
    font-family: monospace;
    color: var(--text-tertiary);
    margin: 0;
    word-break: break-all;
  }

  /* Mobile bottom-sheet layout */
  @media (max-width: 480px) {
    .sidebar {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: 60vh;
      max-height: 60vh;
      border-radius: 16px 16px 0 0;
      padding-bottom: 32px;
    }

    .sidebar::before {
      content: '';
      display: block;
      width: 40px;
      height: 4px;
      background: var(--disabled-bg);
      border-radius: 2px;
      margin: 0 auto 12px;
      flex-shrink: 0;
    }

    .watermark {
      position: relative;
      bottom: auto;
      right: auto;
      margin-top: auto;
    }
  }

  /* ── Add node form ────────────────────────────────────────────────── */
  .add-node-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
  }

  .add-node-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .add-node-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-dimmed);
    width: 40px;
    flex-shrink: 0;
  }

  .add-node-input {
    flex: 1;
    font-size: 0.8rem;
    font-family: inherit;
    color: var(--text-primary);
    background: var(--hover-bg);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 4px 6px;
    outline: none;
    box-sizing: border-box;
  }

  .add-node-input:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  .add-node-id-input {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .add-node-textarea {
    flex: 1;
    font-size: 0.8rem;
    font-family: inherit;
    color: var(--text-primary);
    background: var(--hover-bg);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 4px 6px;
    outline: none;
    resize: vertical;
    min-height: 40px;
    box-sizing: border-box;
  }

  .add-node-textarea:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  .add-node-select {
    flex: 1;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
    background: var(--hover-bg);
    color: var(--text-primary);
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    outline: none;
  }

  .add-node-select:focus {
    border-color: var(--color-accent, #60a5fa);
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25);
  }

  .add-node-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    margin-top: 2px;
  }

  .add-node-confirm {
    background: var(--color-accent, #60a5fa);
    border: none;
    color: #fff;
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 6px;
  }

  .add-node-confirm:hover {
    filter: brightness(1.1);
  }

  .add-node-cancel {
    background: none;
    border: none;
    color: var(--text-dimmed);
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .add-node-cancel:hover {
    color: var(--text-tertiary);
    background: var(--hover-bg);
  }

  /* ── Dependency choice panel ──────────────────────────────────────── */
  .dep-choice-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }

  .dep-choice-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-tertiary);
    background: none;
    border: 1px solid var(--border-subtle);
    font-family: inherit;
    text-align: left;
    width: 100%;
  }

  .dep-choice-btn:hover {
    border-color: var(--color-accent, #60a5fa);
    color: var(--text-secondary);
    background: var(--hover-bg);
  }

  .dep-choice-cancel {
    background: none;
    border: none;
    color: var(--text-dimmed);
    cursor: pointer;
    font-size: 0.75rem;
    font-family: inherit;
    padding: 4px 8px;
    border-radius: 4px;
    text-align: center;
    margin-top: 2px;
  }

  .dep-choice-cancel:hover {
    color: var(--text-tertiary);
    background: var(--hover-bg);
  }
</style>
