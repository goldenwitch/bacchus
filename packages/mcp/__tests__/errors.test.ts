import { describe, it, expect } from 'vitest';

import {
  parse,
  getTask,
  addTask,
  removeTask,
  setStatus,
  isValidStatus,
  applyBatch,
  validate,
  VineError,
  VineParseError,
  VineValidationError,
  EMPTY_ANNOTATIONS,
} from '@bacchus/core';
import type { ConcreteTask, VineGraph } from '@bacchus/core';

import { readGraph } from '../src/io.js';

import { makeTempDir, useTempDir, writeSample, readFixture } from './fixtures/helpers.js';

useTempDir();

describe('error handling', () => {
  it('addTask with duplicate id throws VineError', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    const dup: ConcreteTask = {
      kind: 'task', id: 'root', shortName: 'Dup', description: '',
      status: 'notstarted', dependencies: [], decisions: [],
      annotations: EMPTY_ANNOTATIONS, attachments: [],
    };
    expect(() => addTask(graph, dup)).toThrow(VineError);
  });

  it('removeTask on root throws VineError', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(() => removeTask(graph, 'root')).toThrow(VineError);
  });

  it('isValidStatus rejects invalid status strings', () => {
    expect(isValidStatus('banana')).toBe(false);
    expect(isValidStatus('complete')).toBe(true);
    expect(isValidStatus('')).toBe(false);
  });

  it('getTask with unknown id throws VineError', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    expect(() => getTask(graph, 'nonexistent')).toThrow(VineError);
  });

  it('parse invalid .vine throws VineParseError', () => {
    expect(() => parse('totally invalid content')).toThrow(VineParseError);
  });
});

describe('error details', () => {
  it('VineValidationError includes details', () => {
    const graph = readGraph(writeSample(makeTempDir()));
    try {
      applyBatch(graph, [{ op: 'add_task', id: 'island', name: 'Island Task' }]);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(VineValidationError);
      if (err instanceof VineValidationError) {
        expect(err.constraint).toBe('no-islands');
        expect(err.details).toBeDefined();
        if ('islandTaskIds' in err.details) {
          expect(err.details.islandTaskIds).toContain('island');
        }
      }
    }
  });
});

describe('formatError coverage', () => {
  it('VineParseError has correct line number', () => {
    try {
      parse('not a vine file');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineParseError);
      expect((e as VineParseError).line).toBeDefined();
      expect((e as VineParseError).line).toBeGreaterThan(0);
    }
  });

  it('VineValidationError has constraint and details', () => {
    try {
      const graph = parse(readFixture('sample.vine'));
      applyBatch(graph, [{ op: 'add_task', id: 'island', name: 'Island' }]);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineValidationError);
      if (e instanceof VineValidationError) {
        expect(e.constraint).toBeDefined();
        expect(e.details).toBeDefined();
        expect(e.constraint).toBe('no-islands');
      }
    }
  });

  it('VineError has a message', () => {
    try {
      const graph = parse(readFixture('sample.vine'));
      getTask(graph, 'nonexistent');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(VineError);
      expect((e as VineError).message).toBeTruthy();
    }
  });
});

describe('validate function', () => {
  it('valid graph does not throw', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => validate(graph)).not.toThrow();
  });

  it('graph with missing dependency ref throws', () => {
    const seedTask: ConcreteTask = {
      kind: 'task', id: 'root', shortName: 'Root', status: 'notstarted',
      description: '', dependencies: ['missing'], decisions: [], attachments: [],
      annotations: EMPTY_ANNOTATIONS,
    };
    const graph: VineGraph = {
      version: '1.0.0', title: undefined, delimiter: '---', prefix: undefined,
      tasks: new Map([['root', seedTask]]), order: ['root'],
    };
    expect(() => validate(graph)).toThrow(VineValidationError);
  });

  it('empty graph throws', () => {
    const graph: VineGraph = {
      version: '1.0.0', title: undefined, delimiter: '---', prefix: undefined,
      tasks: new Map(), order: [],
    };
    expect(() => validate(graph)).toThrow(VineValidationError);
  });
});

describe('isValidStatus edge cases', () => {
  it('accepts all valid statuses', () => {
    const validStatuses = ['notstarted', 'planning', 'started', 'reviewing', 'complete', 'blocked'];
    for (const s of validStatuses) {
      expect(isValidStatus(s)).toBe(true);
    }
  });

  it('rejects various invalid strings', () => {
    expect(isValidStatus('COMPLETE')).toBe(false);
    expect(isValidStatus('done')).toBe(false);
    expect(isValidStatus('in-progress')).toBe(false);
    expect(isValidStatus(' complete')).toBe(false);
    expect(isValidStatus('complete ')).toBe(false);
  });
});

describe('setStatus function', () => {
  it('changes status and preserves other fields', () => {
    const graph = parse(readFixture('sample.vine'));
    const updated = setStatus(graph, 'leaf', 'started');
    const task = getTask(updated, 'leaf') as ConcreteTask;
    expect(task.status).toBe('started');
    expect(task.shortName).toBe('Leaf Task');
    expect(task.description).toBe('A leaf task.');
  });

  it('setStatus on nonexistent task throws', () => {
    const graph = parse(readFixture('sample.vine'));
    expect(() => setStatus(graph, 'nope', 'started')).toThrow();
  });
});
