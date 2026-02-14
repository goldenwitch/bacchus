/**
 * Task completion status.
 */
export type Status =
  | 'complete'
  | 'notstarted'
  | 'planning'
  | 'blocked'
  | 'started';

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
}

/**
 * An immutable task graph parsed from a .vine file.
 *
 * - `tasks` maps task id → Task.
 * - `order` preserves file order; the last element is always the root task.
 */
export interface VineGraph {
  readonly tasks: ReadonlyMap<string, Task>;
  readonly order: readonly string[];
}
