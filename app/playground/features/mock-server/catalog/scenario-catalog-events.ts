export const SCENARIO_CATALOG_CHANGED = "layang:scenario-catalog-changed";

export function notifyScenarioCatalogChanged(directoryPath: string) {
  window.dispatchEvent(new CustomEvent(SCENARIO_CATALOG_CHANGED, { detail: directoryPath }));
}
