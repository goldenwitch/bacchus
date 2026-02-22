// ---------------------------------------------------------------------------
// Re-export the public parse API from the parser/ module.
//
// The parser implementation is split across:
//   parser/constants.ts — regex patterns, shared types
//   parser/preamble.ts  — magic line & preamble parsing
//   parser/blocks.ts    — block splitting & unified block parser
//   parser/index.ts     — orchestration (the `parse` function)
// ---------------------------------------------------------------------------
export { parse } from './parser/index.js';
