/**
 * The scale `HeatmapChart` draws with, kept apart so it can be tested without a DOM.
 *
 * A cell's opacity grows with its value against the largest value in the grid. A missing value
 * (`null`) is not a zero: it has no opacity of its own and the chart draws it as an empty cell.
 */

/** Opacity of the quietest drawn cell, so a small value is still visible against the card. */
export const HEATMAP_MIN_OPACITY = 0.05

/** The largest finite value in the grid, or 0 when there is none. */
export function heatmapMax(values: readonly (readonly (number | null)[])[]): number {
  let max = 0
  for (const row of values) {
    for (const value of row) {
      if (value !== null && Number.isFinite(value) && value > max) max = value
    }
  }
  return max
}

/** A cell's opacity in [HEATMAP_MIN_OPACITY, 1], or `null` for a missing value. */
export function heatmapOpacity(value: number | null, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null
  if (max <= 0 || value <= 0) return HEATMAP_MIN_OPACITY
  const ratio = Math.min(1, value / max)
  return HEATMAP_MIN_OPACITY + ratio * (1 - HEATMAP_MIN_OPACITY)
}
