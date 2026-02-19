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
 */
export interface Task {
  readonly id: string;
  readonly shortName: string;
  readonly description: string;
  readonly status: Status;
  readonly dependencies: readonly string[];
  readonly decisions: readonly string[];
  readonly attachments: readonly Attachment[];
}

/**
 * An immutable task graph parsed from a .vine file.
 *
 * - `version` is the VINE format version (e.g., `'1.0.0'`).
 * - `title` is an optional human-readable name for the graph.
 * - `delimiter` is the string used to separate task blocks (default `'---'`).
 * - `tasks` maps task id → Task.
 * - `order` preserves file order; the first element is always the root task.
 */
export interface VineGraph {
  readonly version: string;
  readonly title: string | undefined;
  readonly delimiter: string;
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
