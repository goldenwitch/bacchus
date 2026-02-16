import type { Page, Route } from '@playwright/test';

/** A text content block. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    };

/** The reason the model stopped generating. */
export type StopReason = 'end_turn' | 'tool_use';

let toolCounter = 0;

/** Generate a unique mock tool-use ID. */
export function toolId(): string {
  return `toolu_mock_${String(++toolCounter).padStart(4, '0')}`;
}

/**
 * Split a string into chunks of approximately `size` characters.
 * The last chunk may be shorter.
 */
function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

/** Format a single SSE event. */
function sseEvent(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Build a full SSE response body from high-level content block descriptors.
 *
 * Follows the Anthropic streaming protocol:
 * `message_start` → per-block (`content_block_start` → deltas → `content_block_stop`) → `message_delta` → `message_stop`.
 *
 * The stop reason is auto-inferred: `"tool_use"` if any block has `type: 'tool_use'`, otherwise `"end_turn"`.
 */
export function buildSSEStream(blocks: ContentBlock[]): string {
  const stopReason: StopReason = blocks.some((b) => b.type === 'tool_use')
    ? 'tool_use'
    : 'end_turn';

  let body = '';

  // message_start
  body += sseEvent('message_start', {
    type: 'message_start',
    message: {
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-sonnet-4-20250514',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;

    if (block.type === 'text') {
      // content_block_start
      body += sseEvent('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      });

      // content_block_delta — split text into ~40-char chunks
      const chunks = chunkString(block.text, 40);
      for (const chunk of chunks) {
        body += sseEvent('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: chunk },
        });
      }

      // content_block_stop
      body += sseEvent('content_block_stop', {
        type: 'content_block_stop',
        index,
      });
    } else {
      // tool_use
      // content_block_start
      body += sseEvent('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: {},
        },
      });

      // content_block_delta — stringify input JSON and split into 2-3 chunks
      const jsonStr = JSON.stringify(block.input);
      const chunkSize = Math.max(1, Math.ceil(jsonStr.length / 3));
      const jsonChunks = chunkString(jsonStr, chunkSize);
      for (const partial of jsonChunks) {
        body += sseEvent('content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: partial },
        });
      }

      // content_block_stop
      body += sseEvent('content_block_stop', {
        type: 'content_block_stop',
        index,
      });
    }
  }

  // message_delta
  body += sseEvent('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stopReason },
  });

  // message_stop
  body += sseEvent('message_stop', { type: 'message_stop' });

  return body;
}

/**
 * Intercept Anthropic API calls and fulfill them with scripted SSE responses.
 *
 * Each element in `responses` is the `ContentBlock[]` for one LLM round.
 * The mock cycles through them in order (round 0 for the first call, round 1 for the second, etc.).
 * If the model is called more times than there are scripted responses, it returns a fallback text message.
 */
export async function routeAnthropicAPI(
  page: Page,
  responses: ContentBlock[][],
): Promise<void> {
  let callIndex = 0;
  await page.route('**/v1/messages', (route: Route) => {
    const blocks = responses[callIndex] ?? [
      { type: 'text' as const, text: 'No more scripted responses.' },
    ];
    callIndex++;
    const body = buildSSEStream(blocks);
    void route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    });
  });
}

/**
 * Intercept Anthropic API calls and fulfill them with an error response.
 *
 * @param page - Playwright page instance.
 * @param status - HTTP status code to return (e.g. 429, 500).
 * @param errorText - Error message body.
 */
export async function routeAnthropicError(
  page: Page,
  status: number,
  errorText: string,
): Promise<void> {
  await page.route('**/v1/messages', (route: Route) => {
    void route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'error',
        error: { type: 'api_error', message: errorText },
      }),
    });
  });
}
