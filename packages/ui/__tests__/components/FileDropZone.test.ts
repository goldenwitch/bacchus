import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import FileDropZone from '../../src/lib/components/FileDropZone.svelte';

describe('FileDropZone', () => {
  let onload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onload = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders drop zone with prompt text', () => {
    render(FileDropZone, { props: { onload } });
    expect(screen.getByText(/\.vine/)).toBeInTheDocument();
    const dropzone = document.querySelector('.dropzone')!;
    expect(dropzone).toHaveAttribute('role', 'button');
  });

  it('shows highlight class on dragover', async () => {
    render(FileDropZone, { props: { onload } });
    const dropzone = document.querySelector('.dropzone')!;
    await fireEvent.dragOver(dropzone);
    await tick();
    expect(dropzone).toHaveClass('dragover');
  });

  it('removes highlight on dragleave', async () => {
    render(FileDropZone, { props: { onload } });
    const dropzone = document.querySelector('.dropzone')!;
    await fireEvent.dragOver(dropzone);
    await tick();
    expect(dropzone).toHaveClass('dragover');
    await fireEvent.dragLeave(dropzone);
    await tick();
    expect(dropzone).not.toHaveClass('dragover');
  });

  it('reads dropped file and calls onload', async () => {
    vi.stubGlobal(
      'FileReader',
      class {
        result: string | null = null;
        onload: (() => void) | null = null;
        readAsText() {
          this.result = 'file content here';
          this.onload?.();
        }
      },
    );

    render(FileDropZone, { props: { onload } });
    const dropzone = document.querySelector('.dropzone')!;

    const file = new File(['file content here'], 'test.vine', {
      type: 'text/plain',
    });
    const dataTransfer = { files: [file] };

    await fireEvent.drop(dropzone, { dataTransfer });
    await tick();
    await vi.advanceTimersByTimeAsync(600);

    expect(onload).toHaveBeenCalledWith('file content here');
  });

  it('browse button exists', () => {
    render(FileDropZone, { props: { onload } });
    const browseBtn = document.querySelector('.dropzone > button')!;
    expect(browseBtn).toBeInTheDocument();
    expect(browseBtn).toHaveTextContent('Browse');
  });

  it('has role=button and tabindex=0', () => {
    render(FileDropZone, { props: { onload } });
    const dropzone = document.querySelector('.dropzone')!;
    expect(dropzone).toHaveAttribute('role', 'button');
    expect(dropzone).toHaveAttribute('tabindex', '0');
  });

  it('accepts .vine and .txt files', () => {
    render(FileDropZone, { props: { onload } });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.vine,.txt');
  });
});
