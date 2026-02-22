// Types
export type { Attachment, AttachmentClass, Status, Task, VineGraph } from './types.js';
export { VALID_STATUSES, isValidStatus, isVineRef } from './types.js';

// Errors
export { VineError, VineParseError, VineValidationError } from './errors.js';
export type { ValidationConstraint, ValidationDetails } from './errors.js';

// Parse & Serialize
export { parse } from './parser.js';
export { serialize } from './serializer.js';
export { validate } from './validator.js';

// Graph Queries
export { getTask, getRoot, getRootId, getDependencies, getDependants } from './graph.js';

// Mutations
export {
  addTask,
  removeTask,
  setStatus,
  updateTask,
  addDependency,
  removeDependency,
} from './mutations.js';

// Expansion
export { expandVineRef } from './expansion.js';

// Search & Filter
export type { GraphSummary } from './search.js';
export {
  filterByStatus,
  searchTasks,
  getLeaves,
  getDescendants,
  getSummary,
} from './search.js';
