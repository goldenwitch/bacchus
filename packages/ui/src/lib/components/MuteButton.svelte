<script lang="ts">
  import { isMuted, setMuted, getVolume, setVolume } from '../sound.js';

  let muted = $state(isMuted());
  let vol = $state(getVolume());
  let showSlider = $state(false);
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  function toggle() {
    muted = !muted;
    setMuted(muted);
    if (!muted && vol === 0) {
      vol = 0.3;
      setVolume(vol);
    }
  }

  function handleVolumeChange(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    vol = value;
    setVolume(value);
    muted = value === 0;
  }

  function handleMouseEnter() {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    showSlider = true;
  }

  function handleMouseLeave() {
    hideTimeout = setTimeout(() => {
      showSlider = false;
    }, 300);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="mute-wrapper"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <button class="mute-btn" onclick={toggle} title={muted ? 'Unmute' : 'Mute'}>
    {muted ? '🔇' : '🔊'}
  </button>
  {#if showSlider}
    <div class="volume-popup">
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={vol}
        oninput={handleVolumeChange}
        aria-label="Volume"
        class="volume-slider"
      />
    </div>
  {/if}
</div>

<style>
  .mute-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .mute-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 6px;
    line-height: 1;
  }

  .mute-btn:hover {
    opacity: 0.8;
  }

  .volume-popup {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: var(--toolbar-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 12px 8px;
    margin-top: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .volume-slider {
    writing-mode: vertical-lr;
    direction: rtl;
    width: 4px;
    height: 80px;
    accent-color: var(--accent-green);
    cursor: pointer;
  }
</style>
