<script lang="ts">
  import { isMuted, setMuted } from '../sound.js';

  let muted = $state(isMuted());

  function toggle() {
    muted = !muted;
    setMuted(muted);
  }
</script>

<button class="mute-btn" onclick={toggle} title={muted ? 'Unmute' : 'Mute'}>
  {muted ? '🔇' : '🔊'}
</button>

<style>
  .mute-btn {
    background: transparent;
    border: none;
    color: #e2e8f0;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 6px;
    line-height: 1;
  }

  .mute-btn:hover {
    opacity: 0.8;
  }
</style>
