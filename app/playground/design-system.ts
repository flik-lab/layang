/**
 * Backward-compatible export for workbench feature modules.
 * The canonical design-system contract lives outside the app route so shared
 * UI primitives and adapters never depend on a feature directory.
 */
export {
  colorTokens,
  designSystem,
  paletteMode,
  type ColorMode,
} from "@/lib/design-system";
