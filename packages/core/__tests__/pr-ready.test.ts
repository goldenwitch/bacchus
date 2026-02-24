import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/parser.js';
import { validate } from '../src/validator.js';
import { serialize } from '../src/serializer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vineContent = readFileSync(
  join(__dirname, '..', '..', '..', 'prompts', 'pr-ready.vine'),
  'utf-8',
);

describe('pr-ready.vine', () => {
  it('parses without errors', () => {
    const graph = parse(vineContent);
    expect(graph).toBeDefined();
    expect(graph.version).toBe('1.2.0');
    expect(graph.title).toBe('PR Readiness Checklist');
  });

  it('validates with zero errors', () => {
    const graph = parse(vineContent);
    expect(() => validate(graph)).not.toThrow();
  });

  it('has expected node count (13 tasks)', () => {
    const graph = parse(vineContent);
    expect(graph.tasks.size).toBe(13);
  });

  it('has correct root node', () => {
    const graph = parse(vineContent);
    expect(graph.order[0]).toBe('pr-ready');
    const root = graph.tasks.get('pr-ready')!;
    expect(root.shortName).toBe('PR Ready for Review');
    expect(root.status).toBe('notstarted');
  });

  it('has correct dependency fan-out from push', () => {
    const graph = parse(vineContent);
    const push = graph.tasks.get('push')!;
    expect([...push.dependencies].sort()).toEqual([
      'build-vscode',
      'e2e',
      'format-check',
      'lint',
      'test',
      'typecheck',
    ] as readonly string[]);
  });

  it('all check tasks depend on changes', () => {
    const graph = parse(vineContent);
    const checkTasks = [
      'typecheck',
      'lint',
      'format-check',
      'test',
      'e2e',
      'build-vscode',
    ];
    for (const id of checkTasks) {
      const task = graph.tasks.get(id)!;
      expect(
        [...task.dependencies],
        `${id} should depend on changes`,
      ).toContain('changes');
    }
  });

  it('leaf node is branch with no dependencies', () => {
    const graph = parse(vineContent);
    const branch = graph.tasks.get('branch')!;
    expect(branch.dependencies.length).toBe(0);
  });

  it('all tasks have valid statuses', () => {
    const graph = parse(vineContent);
    const validStatuses = ['notstarted', 'planning', 'started', 'reviewing', 'complete', 'blocked'];
    for (const [id, task] of graph.tasks) {
      expect(validStatuses, `${id} should have a valid status`).toContain(task.status);
    }
  });

  it('has decisions on the right tasks', () => {
    const graph = parse(vineContent);
    expect(graph.tasks.get('format-check')!.decisions.length).toBeGreaterThan(
      0,
    );
    expect(graph.tasks.get('e2e')!.decisions.length).toBeGreaterThan(0);
    expect(graph.tasks.get('build-vscode')!.decisions.length).toBeGreaterThan(
      0,
    );
    expect(graph.tasks.get('ci-green')!.decisions.length).toBeGreaterThan(0);
  });

  it('round-trips through serialize → parse', () => {
    const graph1 = parse(vineContent);
    const serialized = serialize(graph1);
    const graph2 = parse(serialized);
    expect(graph2.tasks.size).toBe(graph1.tasks.size);
    expect(graph2.order).toEqual(graph1.order);
    for (const [id, task] of graph1.tasks) {
      const task2 = graph2.tasks.get(id)!;
      expect(task2.name, `${id} name mismatch`).toBe(task.name);
      expect(task2.status, `${id} status mismatch`).toBe(task.status);
      expect([...task2.dependencies].sort(), `${id} deps mismatch`).toEqual(
        [...task.dependencies].sort() as readonly string[],
      );
    }
  });
});
