<script module lang="ts">
  declare const __APP_VERSION__: string;
  declare const __APP_COMMIT__: string;
</script>

<script lang="ts">
  import type { VineGraph } from '@bacchus/core';
  import {
    parse,
    serialize,
    getRoot,
    VineParseError,
    VineValidationError,
  } from '@bacchus/core';
  import GraphView from './lib/components/GraphView.svelte';
  import LandingScreen from './lib/components/LandingScreen.svelte';
  import { initAudio } from './lib/sound.js';
  import { ChatSession } from './lib/chat/session.js';
  import { saveSession, loadSession } from './lib/chat/sessionStore.js';
  import {
    saveAppState,
    loadLatestAppState,
    migrateFromLocalStorage,
  } from './lib/persistence.js';

  let vineGraph: VineGraph | null = $state(null);
  const chatSession = new ChatSession();
  let chatOpen = $state(false);

  // Camera state — updated from GraphView
  let cameraTransform: { x: number; y: number; k: number } = $state({
    x: 0,
    y: 0,
    k: 1,
  });
  let focusedTaskId: string | null = $state(null);

  // Keep the session's graph in sync with the app graph
  $effect(() => {
    chatSession.setGraph(vineGraph);
  });

  // Track the vineId (root task id) and persist chat sessions
  let vineId: string | null = $state(null);

  $effect(() => {
    if (vineGraph) {
      const rootId = getRoot(vineGraph).id;
      if (rootId !== vineId) {
        // Save previous session before switching
        if (vineId && chatSession.displayMessages.length > 0) {
          void saveSession(vineId, chatSession.displayMessages, [
            ...chatSession.getChatMessages(),
          ]).catch(() => {});
        }
        vineId = rootId;
        chatSession.vineId = rootId;

        // Try to restore a previous session for the new vineId
        void loadSession(rootId)
          .then((saved) => {
            if (saved && saved.displayMessages.length > 0) {
              chatSession.displayMessages = [...saved.displayMessages];
              chatSession.initOrchestrator(vineGraph);
              chatSession.setChatMessages([...saved.chatMessages]);
            }
          })
          .catch(() => {});
      }
    } else {
      // Leaving graph view — save current session
      if (vineId && chatSession.displayMessages.length > 0) {
        void saveSession(vineId, chatSession.displayMessages, [
          ...chatSession.getChatMessages(),
        ]).catch(() => {});
      }
      vineId = null;
      chatSession.vineId = null;
    }
  });

  // Save the chat session after each completed assistant turn
  $effect(() => {
    // Re-run when display messages change
    void chatSession.displayMessages.length;
    if (
      vineId &&
      chatSession.displayMessages.length > 0 &&
      !chatSession.isLoading
    ) {
      void saveSession(vineId, chatSession.displayMessages, [
        ...chatSession.getChatMessages(),
      ]).catch(() => {});
    }
  });

  // Debounced persistence of full app state to IndexedDB
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function debouncedSaveState() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!vineGraph || !vineId) return;
      const vineText = serialize(vineGraph);
      void saveAppState({
        vineId,
        vineText,
        camera: {
          x: cameraTransform.x,
          y: cameraTransform.y,
          k: cameraTransform.k,
        },
        focusedTaskId,
        chatOpen,
        inputDraft: chatSession.inputDraft,
        savedAt: Date.now(),
      });
    }, 500);
  }

  $effect(() => {
    // Track state changes that should trigger persistence
    void vineGraph;
    void cameraTransform;
    void focusedTaskId;
    void chatOpen;
    if (vineGraph && vineId) {
      debouncedSaveState();
    }
  });

  // Save state eagerly on tab close
  $effect(() => {
    const handler = () => {
      if (!vineGraph || !vineId) return;
      try {
        const vineText = serialize(vineGraph);
        void saveAppState({
          vineId,
          vineText,
          camera: {
            x: cameraTransform.x,
            y: cameraTransform.y,
            k: cameraTransform.k,
          },
          focusedTaskId,
          chatOpen,
          inputDraft: chatSession.inputDraft,
          savedAt: Date.now(),
        });
      } catch {
        // Best-effort on unload
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  let autoLoading = $state(false);
  let autoLoadError: string | null = $state(null);

  // ---------------------------------------------------------------------------
  // URL routing: /bacchus/{vineId} ↔ landing page
  // ---------------------------------------------------------------------------

  function pushVineRoute(id: string): void {
    const target = `/bacchus/${encodeURIComponent(id)}`;
    if (window.location.pathname !== target) {
      window.history.pushState({ vineId: id }, '', target);
    }
  }

  function pushLandingRoute(): void {
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
  }

  // On mount: parse the current URL to decide initial state
  $effect(() => {
    // Check for ?file=<url> first (legacy sharing link)
    const params = new URLSearchParams(window.location.search);
    const fileUrl = params.get('file');
    if (fileUrl) {
      autoLoading = true;
      autoLoadError = null;
      fetch(fileUrl)
        .then(async (response) => {
          if (!response.ok) {
            autoLoadError = `Failed to load file: ${response.status} ${response.statusText}`;
            return;
          }
          const text = await response.text();
          try {
            vineGraph = parse(text);
            const rootId = getRoot(vineGraph).id;
            document.title = `${getRoot(vineGraph).shortName} — Bacchus`;
            // Redirect to the canonical route
            pushVineRoute(rootId);
          } catch (e: unknown) {
            if (e instanceof VineParseError) {
              autoLoadError = `Parse error on line ${e.line}: ${e.message}`;
            } else if (e instanceof VineValidationError) {
              autoLoadError = `Validation error: ${e.constraint}`;
            } else {
              autoLoadError = String(e);
            }
          }
        })
        .catch(() => {
          autoLoadError = 'Network error';
        })
        .finally(() => {
          autoLoading = false;
        });
      return;
    }

    // Run one-time migration from localStorage to IndexedDB
    migrateFromLocalStorage();

    // Check for /bacchus/{vineId} route — try restoring from session store
    const match = /^\/bacchus\/([^/]+)$/.exec(window.location.pathname);
    if (match) {
      const routeVineId = decodeURIComponent(match[1]);
      autoLoading = true;
      migrateFromLocalStorage().then(async () => {
        try {
          // Try to restore the graph from IndexedDB
          const appState = await loadLatestAppState();
          if (appState && appState.vineId === routeVineId) {
            try {
              vineGraph = parse(appState.vineText);
              vineId = routeVineId;
              document.title = `${getRoot(vineGraph).shortName} — Bacchus`;
              cameraTransform = appState.camera;
              focusedTaskId = appState.focusedTaskId;
              chatOpen = appState.chatOpen;
              chatSession.inputDraft = appState.inputDraft;
            } catch {
              // Parse failed — fall through to show landing with chat
            }
          }
          // Restore chat session regardless
          const savedChat = await loadSession(routeVineId);
          if (savedChat && savedChat.displayMessages.length > 0) {
            chatSession.displayMessages = [...savedChat.displayMessages];
            chatSession.vineId = routeVineId;
            chatSession.initOrchestrator(vineGraph);
            chatSession.setChatMessages([...savedChat.chatMessages]);
            if (!vineGraph) chatOpen = true;
          }
        } finally {
          autoLoading = false;
        }
      });
      return;
    }

    // Handle browser back/forward navigation
    const handlePopState = () => {
      const popMatch = /^\/bacchus\/([^/]+)$/.exec(window.location.pathname);
      if (popMatch && vineGraph) {
        // Already on graphs view — check if we need to switch
        const popVineId = decodeURIComponent(popMatch[1]);
        if (popVineId !== vineId) {
          vineGraph = null;
          vineId = null;
          chatSession.vineId = null;
          window.history.replaceState(null, '', '/');
        }
      } else if (!popMatch && vineGraph) {
        // Navigated back to landing
        vineGraph = null;
        document.title = 'Bacchus UI';
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  });

  // Initialize audio context on first user interaction
  $effect(() => {
    const handler = () => initAudio();
    document.addEventListener('click', handler, { once: true });
    return () => document.removeEventListener('click', handler);
  });

  function handleGraphLoaded(graph: VineGraph) {
    vineGraph = graph;
    const rootId = getRoot(graph).id;
    document.title = `${getRoot(graph).shortName} — Bacchus`;
    pushVineRoute(rootId);
  }

  function handleReset() {
    vineGraph = null;
    document.title = 'Bacchus UI';
    pushLandingRoute();
  }

  function handleGraphUpdate(updated: VineGraph) {
    vineGraph = updated;
    document.title = `${getRoot(updated).shortName} — Bacchus`;
  }

  function handleCameraChange(t: { x: number; y: number; k: number }) {
    cameraTransform = t;
  }
</script>

<main>
  {#if vineGraph}
    <GraphView
      graph={vineGraph}
      graphTitle={getRoot(vineGraph).shortName}
      onreset={handleReset}
      onupdate={handleGraphUpdate}
      oncamerachange={handleCameraChange}
      initialCamera={cameraTransform}
      {chatOpen}
      {chatSession}
      ontoggle={() => {
        chatOpen = !chatOpen;
      }}
    />
  {:else if autoLoading}
    <div class="loading">
      <p>Loading…</p>
    </div>
  {:else}
    <LandingScreen
      onload={handleGraphLoaded}
      onupdate={handleGraphUpdate}
      {chatOpen}
      {chatSession}
      ontoggle={() => {
        chatOpen = !chatOpen;
      }}
    />
    {#if autoLoadError}
      <div class="auto-error">
        <p>{autoLoadError}</p>
        <button
          onclick={() => {
            autoLoadError = null;
          }}>Dismiss</button
        >
      </div>
    {/if}
  {/if}
  <span class="version-watermark">v{__APP_VERSION__} ({__APP_COMMIT__})</span>
</main>

<style>
  main {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .version-watermark {
    position: fixed;
    bottom: 6px;
    right: 10px;
    font-size: 0.65rem;
    color: var(--text-muted);
    opacity: 0.4;
    pointer-events: none;
    z-index: 9999;
    font-family: monospace;
  }

  .loading {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 1.2rem;
  }

  .auto-error {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 14px 20px;
    border: 1px solid var(--color-error);
    border-radius: 10px;
    background: var(--sidebar-bg);
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 100;
  }

  .auto-error p {
    margin: 0;
    color: var(--color-error-text);
    font-size: 0.9rem;
  }

  .auto-error button {
    padding: 4px 14px;
    border: 1px solid var(--color-error);
    border-radius: 6px;
    background: transparent;
    color: var(--color-error);
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background 150ms,
      color 150ms;
    white-space: nowrap;
  }

  .auto-error button:hover {
    background: var(--color-error);
    color: var(--bg-primary);
  }
</style>
