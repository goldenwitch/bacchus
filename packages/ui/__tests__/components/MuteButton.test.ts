import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('../../src/lib/sound.js', () => ({
  isMuted: vi.fn(() => false),
  setMuted: vi.fn(),
  getVolume: vi.fn(() => 0.3),
  setVolume: vi.fn(),
  initAudio: vi.fn(),
  playPop: vi.fn(),
  playHover: vi.fn(),
  playWhoosh: vi.fn(),
}));

import MuteButton from '../../src/lib/components/MuteButton.svelte';
import { isMuted, setMuted } from '../../src/lib/sound.js';

describe('MuteButton', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isMuted).mockReturnValue(false);
  });

  it('renders 🔊 when unmuted', () => {
    render(MuteButton);
    expect(screen.getByRole('button')).toHaveTextContent('🔊');
  });

  it('renders 🔇 when muted', () => {
    vi.mocked(isMuted).mockReturnValue(true);
    render(MuteButton);
    expect(screen.getByRole('button')).toHaveTextContent('🔇');
  });

  it('click toggles to muted', async () => {
    render(MuteButton);
    const button = screen.getByRole('button');
    await fireEvent.click(button);
    await tick();
    expect(setMuted).toHaveBeenCalledWith(true);
  });

  it('title is "Mute" when unmuted', () => {
    render(MuteButton);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Mute');
  });

  it('title is "Unmute" when muted', () => {
    vi.mocked(isMuted).mockReturnValue(true);
    render(MuteButton);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Unmute');
  });
});
