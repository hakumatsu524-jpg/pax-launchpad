/** Formatting helpers for CLI and demo output. */

export function fmtPax(n: number): string {
  return `${round(n, 2).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export function fmtTokens(n: number): string {
  return round(n, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function fmtPrice(n: number): string {
  if (n === 0) return '0'
  if (n < 0.001) return n.toExponential(3)
  return round(n, 6).toString()
}

export function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}
