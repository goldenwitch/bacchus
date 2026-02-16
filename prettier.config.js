import * as sveltePlugin from 'prettier-plugin-svelte';

/** @type {import("prettier").Config} */
export default {
  singleQuote: true,
  trailingComma: 'all',
  plugins: [sveltePlugin],
};
