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

/**
 * A single task in the vine graph.
 * All fields are deeply readonly — consumers cannot mutate graph data.
 *
 * When `vine` is set the node is a **reference node** — it points to an
 * external `.vine` file and carries no status of its own (`status` will
 * be `undefined`).
 */
export interface Task {
  readonly id: string;
  readonly shortName: string;
  readonly description: string;
  readonly status: Status | undefined;
  readonly dependencies: readonly string[];
  readonly decisions: readonly string[];
  readonly attachments: readonly Attachment[];
  readonly vine: string | undefined;
}

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
 * Type guard: returns true when `task` is a reference node (has a `vine` URI).
 */
export function isVineRef(task: Task): boolean {
  return task.vine !== undefined;
}
