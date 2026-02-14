import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import UrlInput from '../../src/lib/components/UrlInput.svelte';

describe('UrlInput', () => {
  let onload: ReturnType<typeof vi.fn>;
  let onerror: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onload = vi.fn();
    onerror = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders text input and Load button', () => {
    render(UrlInput, { props: { onload, onerror } });
    expect(screen.getByPlaceholderText('https://example.com/project.vine')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load/i })).toBeInTheDocument();
  });

  it('button is disabled when URL is empty', () => {
    render(UrlInput, { props: { onload, onerror } });
    expect(screen.getByRole('button', { name: /load/i })).toBeDisabled();
  });

  it('button and input disabled while loading', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(UrlInput, { props: { onload, onerror } });
    const input = screen.getByPlaceholderText('https://example.com/project.vine');
    const button = screen.getByRole('button', { name: /load/i });

    await fireEvent.input(input, { target: { value: 'https://example.com/test.vine' } });
    await tick();
    await fireEvent.click(button);
    await tick();

    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();

    // Resolve to clean up
    resolveFetch(new Response('content', { status: 200 }));
    await waitFor(() => expect(input).not.toBeDisabled());
  });

  it('fetches URL and calls onload on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('vine file content', { status: 200 })),
    );

    render(UrlInput, { props: { onload, onerror } });
    const input = screen.getByPlaceholderText('https://example.com/project.vine');

    await fireEvent.input(input, { target: { value: 'https://example.com/test.vine' } });
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => expect(onload).toHaveBeenCalledWith('vine file content'));
    expect(onerror).not.toHaveBeenCalled();
  });

  it('calls onerror with status on HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' })),
    );

    render(UrlInput, { props: { onload, onerror } });
    const input = screen.getByPlaceholderText('https://example.com/project.vine');

    await fireEvent.input(input, { target: { value: 'https://example.com/missing.vine' } });
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() =>
      expect(onerror).toHaveBeenCalledWith('Failed to load file: 404 Not Found'),
    );
    expect(onload).not.toHaveBeenCalled();
  });

  it('calls onerror with Network error on fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(UrlInput, { props: { onload, onerror } });
    const input = screen.getByPlaceholderText('https://example.com/project.vine');

    await fireEvent.input(input, { target: { value: 'https://example.com/test.vine' } });
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => expect(onerror).toHaveBeenCalledWith('Network error'));
    expect(onload).not.toHaveBeenCalled();
  });

  it('Enter key triggers load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('enter content', { status: 200 })),
    );

    render(UrlInput, { props: { onload, onerror } });
    const input = screen.getByPlaceholderText('https://example.com/project.vine');

    await fireEvent.input(input, { target: { value: 'https://example.com/test.vine' } });
    await tick();
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onload).toHaveBeenCalledWith('enter content'));
  });

  it('Enter key does not trigger when URL is empty', async () => {
    vi.stubGlobal('fetch', vi.fn());

    render(UrlInput, { props: { onload, onerror } });
    const input = screen.getByPlaceholderText('https://example.com/project.vine');

    await fireEvent.keyDown(input, { key: 'Enter' });
    await tick();

    expect(fetch).not.toHaveBeenCalled();
  });
});
