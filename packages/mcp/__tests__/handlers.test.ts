import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { setRoots } from '../src/io.js';
import { _resetRootsFetched } from '../src/server.js';

import {
  makeTempDir,
  useTempDir,
  writeSample,
  writeFixture,
  createTestClient,
  callTool,
  resultText,
  resultJSON,
} from './fixtures/helpers.js';
import type { TestClient } from './fixtures/helpers.js';

useTempDir();

// ---------------------------------------------------------------------------
// vine_read handler
// ---------------------------------------------------------------------------

describe('vine_read handler', () => {
  let tc: TestClient;

  beforeAll(async () => {
    tc = await createTestClient();
  });

  afterAll(async () => {
    await tc.cleanup();
  });

  afterEach(() => {
    setRoots([]);
    _resetRootsFetched();
  });

  it('summary action returns formatted overview', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'summary' });
    expect(result.isError).toBeUndefined();
    const text = resultText(result);
    expect(text).toContain('Root: Root Task');
    expect(text).toContain('Total tasks: 4');
    expect(text).toContain('complete: 1');
  });

  it('validate action returns task count', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'validate' });
    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain('4 task(s)');
  });

  it('list action returns all tasks as JSON', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'list' });
    const tasks = resultJSON(result) as Array<{ id: string }>;
    expect(tasks).toHaveLength(4);
    expect(tasks.map((t) => t.id).sort()).toEqual(['child-a', 'child-b', 'leaf', 'root']);
  });

  it('list with status filter returns matching tasks', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'list', status: 'complete' });
    const tasks = resultJSON(result) as Array<{ id: string }>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.id).toBe('child-a');
  });

  it('list with invalid status returns error', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'list', status: 'banana' });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('Invalid status');
  });

  it('task action returns full task detail', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'task', id: 'child-b' });
    const task = resultJSON(result) as { id: string; shortName: string; status: string };
    expect(task.id).toBe('child-b');
    expect(task.shortName).toBe('Child B');
    expect(task.status).toBe('planning');
  });

  it('task action requires id', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'task' });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('id is required');
  });

  it('context action returns task with resolved_dependencies and dependant_tasks', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'context', id: 'child-a' });
    const data = resultJSON(result) as {
      id: string;
      resolved_dependencies: Array<{ id: string }>;
      dependant_tasks: Array<{ id: string }>;
    };
    expect(data.id).toBe('child-a');
    expect(data.resolved_dependencies).toHaveLength(1);
    expect(data.resolved_dependencies[0]!.id).toBe('leaf');
    expect(data.dependant_tasks.length).toBeGreaterThan(0);
  });

  it('descendants action returns transitive dependants', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'descendants', id: 'leaf' });
    const descs = resultJSON(result) as Array<{ id: string }>;
    expect(descs.map((d) => d.id)).toContain('child-a');
    expect(descs.map((d) => d.id)).toContain('child-b');
    expect(descs.map((d) => d.id)).toContain('root');
  });

  it('search action finds tasks by query', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'search', query: 'Root' });
    const tasks = resultJSON(result) as Array<{ id: string }>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.id).toBe('root');
  });

  it('search action requires query', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_read', { file, action: 'search' });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('query is required');
  });

  it('refs action returns ref nodes', async () => {
    const dir = makeTempDir();
    const file = writeFixture(dir, 'ref-parent.vine', 'ref.vine');
    const result = await callTool(tc.client, 'vine_read', { file, action: 'refs' });
    const refs = resultJSON(result) as Array<{ id: string; vine: string }>;
    expect(refs).toHaveLength(1);
    expect(refs[0]!.id).toBe('ext-ref');
    expect(refs[0]!.vine).toBe('./child.vine');
  });

  it('returns error for nonexistent file', async () => {
    const result = await callTool(tc.client, 'vine_read', { file: '/nonexistent/test.vine', action: 'summary' });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('File not found');
  });

  it('returns error for invalid vine content', async () => {
    const dir = makeTempDir();
    const file = join(dir, 'bad.vine');
    writeFileSync(file, 'not a vine file', 'utf-8');
    const result = await callTool(tc.client, 'vine_read', { file, action: 'summary' });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('Parse error');
  });
});

// ---------------------------------------------------------------------------
// vine_next handler
// ---------------------------------------------------------------------------

describe('vine_next handler', () => {
  let tc: TestClient;

  beforeAll(async () => {
    tc = await createTestClient();
  });

  afterAll(async () => {
    await tc.cleanup();
  });

  afterEach(() => {
    setRoots([]);
    _resetRootsFetched();
  });

  it('returns frontier with ready_to_start, progress, etc.', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_next', { file });
    expect(result.isError).toBeUndefined();
    const data = resultJSON(result) as {
      ready_to_start: Array<{ id: string }>;
      ready_to_complete: unknown[];
      blocked: unknown[];
      needs_expansion: unknown[];
      progress: { total: number; complete: number; percentage: number; root_status: string };
    };
    expect(data.ready_to_start.map((t) => t.id)).toEqual(['leaf']);
    expect(data.ready_to_complete).toEqual([]);
    expect(data.progress.total).toBe(4);
    expect(data.progress.complete).toBe(1);
    expect(data.progress.root_status).toBe('started');
  });

  it('returns error for nonexistent file', async () => {
    const result = await callTool(tc.client, 'vine_next', { file: '/nonexistent/test.vine' });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// vine_write handler
// ---------------------------------------------------------------------------

describe('vine_write handler', () => {
  let tc: TestClient;

  beforeAll(async () => {
    tc = await createTestClient();
  });

  afterAll(async () => {
    await tc.cleanup();
  });

  afterEach(() => {
    setRoots([]);
    _resetRootsFetched();
  });

  it('set_status returns summary and progress', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'set_status', id: 'leaf', status: 'started' }],
    });
    expect(result.isError).toBeUndefined();
    const data = resultJSON(result) as { summary: string; progress: { total: number } };
    expect(data.summary).toContain('set "leaf"');
    expect(data.progress.total).toBe(4);
  });

  it('claim returns claimed task with resolved_dependencies', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'claim', id: 'child-a' }],
    });
    expect(result.isError).toBeUndefined();
    const data = resultJSON(result) as {
      claimed: Array<{
        id: string;
        status: string;
        resolved_dependencies: Array<{ id: string }>;
      }>;
    };
    expect(data.claimed).toHaveLength(1);
    expect(data.claimed[0]!.id).toBe('child-a');
    expect(data.claimed[0]!.status).toBe('started');
    expect(data.claimed[0]!.resolved_dependencies).toHaveLength(1);
    expect(data.claimed[0]!.resolved_dependencies[0]!.id).toBe('leaf');
  });

  it('create bootstraps a new graph', async () => {
    const dir = makeTempDir();
    const file = join(dir, 'new-project.vine');
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [
        { op: 'create', version: '1.2.0' },
        { op: 'add_task', id: 'root', name: 'Root Task', description: 'The root' },
        { op: 'add_task', id: 'child', name: 'Child Task' },
        { op: 'add_dep', taskId: 'root', depId: 'child' },
      ],
    });
    expect(result.isError).toBeUndefined();
    const data = resultJSON(result) as { summary: string; progress: { total: number } };
    expect(data.summary).toContain('created graph');
    expect(data.progress.total).toBe(2);
  });

  it('create without add_task fails', async () => {
    const dir = makeTempDir();
    const file = join(dir, 'fail-create.vine');
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [
        { op: 'create' },
        { op: 'set_status', id: 'x', status: 'started' },
      ],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('create requires at least one add_task');
  });

  it('rejects missing op field', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ id: 'leaf', status: 'started' }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('missing "op" field');
  });

  it('rejects unknown op', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'foobar' }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('unknown op');
  });

  it('rejects invalid status in set_status', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'set_status', id: 'leaf', status: 'banana' }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('invalid status');
  });

  it('rejects add_task without id', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'add_task', name: 'NoId' }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('add_task requires "id"');
  });

  it('rejects add_task without name', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'add_task', id: 'x' }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('add_task requires "name"');
  });

  it('rejects non-string dependsOn elements', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'add_task', id: 'x', name: 'X', dependsOn: [1, 2] }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('must be an array of strings');
  });

  it('rejects non-string decisions elements', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'update', id: 'leaf', decisions: [42] }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('must be an array of strings');
  });

  it('rejects bad annotations (non-object)', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'update', id: 'leaf', annotations: 'not-object' }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('must be an object');
  });

  it('rejects bad annotations (non-string-array values)', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'update', id: 'leaf', annotations: { key: 'not-array' } }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('values must be arrays of strings');
  });

  it('rejects bad attachment elements', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'update', id: 'leaf', attachments: [{ class: 'artifact' }] }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('must have class, mime, and uri');
  });

  it('extract_to_ref creates child file and replaces task with ref', async () => {
    const dir = makeTempDir();
    const parentFile = join(dir, 'parent.vine');
    const childFile = join(dir, 'child-extract.vine');
    const parentVine = `vine 1.2.0\n---\n[root] Root (started)\n-> middle\n---\n[middle] Middle (notstarted)\nThe middle task.\n-> leaf\n---\n[leaf] Leaf (notstarted)\n`;
    writeFileSync(parentFile, parentVine, 'utf-8');

    const result = await callTool(tc.client, 'vine_write', {
      file: parentFile,
      operations: [{ op: 'extract_to_ref', id: 'middle', vine: childFile }],
    });
    expect(result.isError).toBeUndefined();
    const data = resultJSON(result) as { summary: string };
    expect(data.summary).toContain('extracted "middle"');
  });

  it('rejects extracting root task', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [{ op: 'extract_to_ref', id: 'root', vine: './root.vine' }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('Cannot extract the root task');
  });

  it('rejects multiple extract_to_ref in batch', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [
        { op: 'extract_to_ref', id: 'child-a', vine: './a.vine' },
        { op: 'extract_to_ref', id: 'child-b', vine: './b.vine' },
      ],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('At most one extract_to_ref');
  });

  it('batch mutation returns frontier', async () => {
    const file = writeSample(makeTempDir());
    const result = await callTool(tc.client, 'vine_write', {
      file,
      operations: [
        { op: 'set_status', id: 'leaf', status: 'complete' },
        { op: 'set_status', id: 'child-b', status: 'started' },
      ],
    });
    expect(result.isError).toBeUndefined();
    const data = resultJSON(result) as {
      ready_to_start: unknown[];
      ready_to_complete: unknown[];
      progress: { complete: number };
    };
    expect(data.progress.complete).toBe(2); // child-a was already complete + leaf
  });
});

// ---------------------------------------------------------------------------
// vine_expand handler
// ---------------------------------------------------------------------------

describe('vine_expand handler', () => {
  let tc: TestClient;

  beforeAll(async () => {
    tc = await createTestClient();
  });

  afterAll(async () => {
    await tc.cleanup();
  });

  afterEach(() => {
    setRoots([]);
    _resetRootsFetched();
  });

  it('expands a ref by inlining child graph', async () => {
    const dir = makeTempDir();
    const parentFile = writeFixture(dir, 'ref-parent.vine', 'parent.vine');
    writeFixture(dir, 'ref-child.vine', 'child.vine');

    const result = await callTool(tc.client, 'vine_expand', {
      file: parentFile,
      ref_id: 'ext-ref',
      child_file: join(dir, 'child.vine'),
    });
    expect(result.isError).toBeUndefined();
    expect(resultText(result)).toContain('Ref "ext-ref" expanded');
  });

  it('returns error for non-ref node', async () => {
    const dir = makeTempDir();
    const file = writeSample(dir, 'parent.vine');
    writeFixture(dir, 'ref-child.vine', 'child.vine');

    const result = await callTool(tc.client, 'vine_expand', {
      file,
      ref_id: 'leaf',
      child_file: join(dir, 'child.vine'),
    });
    expect(result.isError).toBe(true);
  });

  it('returns error for nonexistent ref', async () => {
    const dir = makeTempDir();
    const file = writeSample(dir, 'parent.vine');
    writeFixture(dir, 'ref-child.vine', 'child.vine');

    const result = await callTool(tc.client, 'vine_expand', {
      file,
      ref_id: 'no-such-ref',
      child_file: join(dir, 'child.vine'),
    });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

describe('MCP resources', () => {
  let tc: TestClient;

  beforeAll(async () => {
    tc = await createTestClient();
  });

  afterAll(async () => {
    await tc.cleanup();
  });

  it('vine://spec/brief returns non-empty content', async () => {
    const result = await tc.client.readResource({ uri: 'vine://spec/brief' });
    const entry = result.contents[0];
    const text = (entry && 'text' in entry ? entry.text : '') ?? '';
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('VINE');
  });

  it('vine://spec/full returns non-empty content', async () => {
    const result = await tc.client.readResource({ uri: 'vine://spec/full' });
    const entry = result.contents[0];
    const text = (entry && 'text' in entry ? entry.text : '') ?? '';
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('VINE');
  });
});
