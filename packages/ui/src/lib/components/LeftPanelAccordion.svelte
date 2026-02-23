<script lang="ts">
  import type { VineGraph } from '@bacchus/core';
  import GlassAccordion from './GlassAccordion.svelte';
  import PhysicsPanel from './PhysicsPanel.svelte';
  import VisualsPanel from './VisualsPanel.svelte';
  import ChatPanel from './ChatPanel.svelte';
  import type { PhysicsConfig, PhysicsParamKey } from '../physics.js';
  import type { VisualsConfig, VisualsSliderKey } from '../visuals.js';
  import type { ChatSession } from '../chat/session.js';

  type PanelId = 'chat' | 'physics' | 'visuals';

  let {
    // Chat props
    chatAvailable = false,
    chatOpen = false,
    ontogglechat,
    graph = null,
    onupdate,
    chatSession,
    // Physics props
    physicsConfig,
    onphysicschange,
    onphysicsreset,
    showStrataLines = false,
    ontogglestrata,
    // Visuals props
    visualsConfig,
    onvisualschange,
    onspritechange,
    onvisualsreset,
  }: {
    chatAvailable?: boolean;
    chatOpen?: boolean;
    ontogglechat?: () => void;
    graph?: VineGraph | null;
    onupdate?: (graph: VineGraph) => void;
    chatSession?: ChatSession;
    physicsConfig: PhysicsConfig;
    onphysicschange: (key: PhysicsParamKey, value: number) => void;
    onphysicsreset: () => void;
    showStrataLines?: boolean;
    ontogglestrata?: (show: boolean) => void;
    visualsConfig: VisualsConfig;
    onvisualschange: (key: VisualsSliderKey, value: number) => void;
    onspritechange: (uri: string) => void;
    onvisualsreset: () => void;
  } = $props();

  // Internal accordion state — only one section open at a time.
  // Chat state is driven by the external `chatOpen` prop so the parent
  // (App.svelte) remains the single source of truth for chat visibility.
  let internalPanel: 'physics' | 'visuals' | null = $state(null);

  // Derive activePanel from internal state + chatOpen prop
  const activePanel: PanelId | null = $derived(
    chatOpen ? 'chat' : internalPanel,
  );

  function handleToggle(id: PanelId) {
    if (id === 'chat') {
      // Delegate to parent via callback
      if (ontogglechat) ontogglechat();
      // Close physics/visuals when opening chat
      if (!chatOpen) internalPanel = null;
    } else {
      // Close chat if it's open
      if (chatOpen && ontogglechat) ontogglechat();
      // Toggle physics/visuals
      internalPanel = internalPanel === id ? null : id;
    }
  }

  // When chat opens externally (e.g. Toolbar), close physics/visuals
  $effect(() => {
    if (chatOpen) {
      internalPanel = null;
    }
  });

  // Dynamic width: 340px for Chat, 230px for Physics/Visuals
  const containerWidth = $derived(activePanel === 'chat' ? '340px' : '230px');
</script>

<div
  class="left-panel-accordion"
  style:width={containerWidth}
>
  {#if chatAvailable && chatSession && onupdate}
    <GlassAccordion
      icon="💬"
      title="Chat Planner"
      expanded={activePanel === 'chat'}
      ontoggle={() => handleToggle('chat')}
      ariaLabel="Toggle chat planner"
    >
      <ChatPanel {graph} {onupdate} session={chatSession} />
    </GlassAccordion>
  {/if}

  <GlassAccordion
    icon="🎛️"
    title="Physics"
    expanded={activePanel === 'physics'}
    ontoggle={() => handleToggle('physics')}
    ariaLabel="Toggle physics controls"
  >
    <PhysicsPanel
      config={physicsConfig}
      onchange={onphysicschange}
      onreset={onphysicsreset}
      {showStrataLines}
      {ontogglestrata}
    />
  </GlassAccordion>

  <GlassAccordion
    icon="🎨"
    title="Visuals"
    expanded={activePanel === 'visuals'}
    ontoggle={() => handleToggle('visuals')}
    ariaLabel="Toggle visual controls"
  >
    <VisualsPanel
      config={visualsConfig}
      onchange={onvisualschange}
      onspritechange={onspritechange}
      onreset={onvisualsreset}
    />
  </GlassAccordion>
</div>

<style>
  .left-panel-accordion {
    position: absolute;
    left: 16px;
    top: 60px;
    z-index: 136;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: calc(100vh - 120px);
    transition: width 0.2s ease;
  }

  @media (max-width: 639px) {
    .left-panel-accordion {
      display: none;
    }
  }
</style>
