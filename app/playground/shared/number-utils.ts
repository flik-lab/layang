/** Constrains a numeric value to an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Calculates the arithmetic mean for finite samples. */
export function averageNumbers(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

/** Returns a nearest-rank percentile from a sorted sample. */
export function percentileFromSorted(sortedValues: number[], percent: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((percent / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

/** Returns a random integer in an inclusive range. */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
