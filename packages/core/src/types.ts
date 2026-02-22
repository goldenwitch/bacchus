/**
 * Task completion status.
 */
export type Status =
  | 'complete'
  | 'started'
  | 'reviewing'
  | 'planning'
  | 'notstarted'
  | 'blocked';

/**
 * Classification of an attachment associated with a task.
 */
export type AttachmentClass = 'artifact' | 'guidance' | 'file';

/**
 * An external resource attached to a task.
 */
export interface Attachment {
  readonly class: AttachmentClass;
  readonly mime: string;
  readonly uri: string;
}

// ---------------------------------------------------------------------------
// Discriminated union: Task = ConcreteTask | RefTask
// ---------------------------------------------------------------------------

/**
 * Fields shared by both concrete tasks and reference nodes.
 */
interface BaseNode {
  readonly id: string;
  readonly shortName: string;
  readonly description: string;
  readonly dependencies: readonly string[];
  readonly decisions: readonly string[];
}

/**
 * A concrete task with a completion status and optional attachments.
 */
export interface ConcreteTask extends BaseNode {
  readonly kind: 'task';
  readonly status: Status;
  readonly attachments: readonly Attachment[];
}

/**
 * A reference node that proxies an external `.vine` graph.
 * Carries no status and no attachments.
 */
export interface RefTask extends BaseNode {
  readonly kind: 'ref';
  readonly vine: string;
}

/**
 * A single node in the vine graph — either a concrete task or a reference.
 * Discriminate on `kind` (`'task'` or `'ref'`) for full type narrowing.
 */
export type Task = ConcreteTask | RefTask;

/**
 * An immutable task graph parsed from a .vine file.
 *
 * - `version` is the VINE format version (e.g., `'1.0.0'`).
 * - `title` is an optional human-readable name for the graph.
 * - `delimiter` is the string used to separate task blocks (default `'---'`).
 * - `prefix` controls ID namespacing when this graph is expanded into a parent.
 * - `tasks` maps task id → Task.
 * - `order` preserves file order; the first element is always the root task.
 */
export interface VineGraph {
  readonly version: string;
  readonly title: string | undefined;
  readonly delimiter: string;
  readonly prefix: string | undefined;
  readonly tasks: ReadonlyMap<string, Task>;
  readonly order: readonly string[];
}

/**
 * All valid status values as a runtime-accessible tuple.
 */
export const VALID_STATUSES: readonly Status[] = [
  'complete',
  'started',
  'reviewing',
  'planning',
  'notstarted',
  'blocked',
];

/**
 * Type guard: returns true when `value` is a valid {@link Status}.
 */
export function isValidStatus(value: string): value is Status {
  return VALID_STATUSES.includes(value as Status);
}

/**
 * Type guard: returns true when `task` is a reference node.
 */
export function isVineRef(task: Task): task is RefTask {
  return task.kind === 'ref';
}

/**
 * Type guard: returns true when `task` is a concrete task.
 */
export function isConcreteTask(task: Task): task is ConcreteTask {
  return task.kind === 'task';
}
