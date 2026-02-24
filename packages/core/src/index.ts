// Types
export type {
  Attachment,
  AttachmentClass,
  ConcreteTask,
  RefTask,
  Status,
  Task,
  VineGraph,
} from './types.js';
export {
  EMPTY_ANNOTATIONS,
  VALID_STATUSES,
  isValidStatus,
  isVineRef,
  isConcreteTask,
  getSpriteUri,
} from './types.js';

// Errors
export { VineError, VineParseError, VineValidationError } from './errors.js';
export type { ValidationConstraint, ValidationDetails } from './errors.js';

// Parse & Serialize
export { parse } from './parser.js';
export { serialize } from './serializer.js';
export { validate } from './validator.js';

// Graph Queries
export {
  getTask,
  getRoot,
  getRootId,
  getDependencies,
  getDependants,
} from './graph.js';

// Mutations
export {
  addRef,
  addTask,
  removeTask,
  setStatus,
  updateTask,
  updateRefUri,
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
  getRefs,
  getDescendants,
  getSummary,
} from './search.js';
