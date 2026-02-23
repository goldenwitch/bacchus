// @bacchus/ui library entry point
// Re-exports the embeddable GraphView component and public helpers

export { default as GraphView } from './components/GraphView.svelte';
export {
  STATUS_MAP,
  getStatusColor,
  getStatusDarkColor,
  getStatusEmoji,
  getStatusClass,
} from './status.js';
export type { StatusInfo } from './status.js';
export type { SimNode, SimLink, ViewportTransform } from './types.js';
export type { VisualsConfig, VisualsParamKey, VisualsSliderKey } from './visuals.js';
export {
  VISUALS_SLIDER_DEFS,
  getDefaults as getVisualsDefaults,
  loadOverrides as loadVisualsOverrides,
  saveOverrides as saveVisualsOverrides,
  clearOverrides as clearVisualsOverrides,
  resolveConfig as resolveVisualsConfig,
  injectVisualsCSS,
} from './visuals.js';
