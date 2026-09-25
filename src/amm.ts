/**
 * A constant-product (x*y=k) automated market maker for a single social coin.
 *
 * One side of the pool holds PAX, the other holds the coin's tokens. Traders
 * and the creator-fund treasury swap against the same pool, so every buy pushes
 * the spot price (and therefore the market cap) up, and every sell pushes it
 * down — exactly like a pump.fun bonding curve.
 */
export class ConstantProductAmm {
  paxReserve: number
  tokenReserve: number
  readonly feeBps: number

  constructor(paxReserve: number, tokenReserve: number, feeBps = 100) {
    if (paxReserve <= 0 || tokenReserve <= 0) {
      throw new Error('AMM reserves must be positive')
    }
    this.paxReserve = paxReserve
    this.tokenReserve = tokenReserve
    this.feeBps = feeBps
  }

  /** Invariant k = x * y. */
  get k(): number {
    return this.paxReserve * this.tokenReserve
  }

  /** PAX per token. */
  spotPrice(): number {
    return this.paxReserve / this.tokenReserve
  }

  private feeFactor(): number {
    return 1 - this.feeBps / 10_000
  }

  /** Tokens received for `paxIn` PAX, without mutating the pool. */
  quoteBuy(paxIn: number): number {
    if (paxIn <= 0) return 0
    const effective = paxIn * this.feeFactor()
    return (this.tokenReserve * effective) / (this.paxReserve + effective)
  }

  /** PAX received for selling `tokensIn` tokens, without mutating the pool. */
  quoteSell(tokensIn: number): number {
    if (tokensIn <= 0) return 0
    const effective = tokensIn * this.feeFactor()
    return (this.paxReserve * effective) / (this.tokenReserve + effective)
  }

  /** Execute a buy: add PAX, remove tokens. Returns tokens out. */
  buy(paxIn: number): number {
    const tokensOut = this.quoteBuy(paxIn)
    this.paxReserve += paxIn
    this.tokenReserve -= tokensOut
    return tokensOut
  }

  /** Execute a sell: add tokens, remove PAX. Returns PAX out. */
  sell(tokensIn: number): number {
    const paxOut = this.quoteSell(tokensIn)
    this.tokenReserve += tokensIn
    this.paxReserve -= paxOut
    return paxOut
  }

  /**
   * PAX that must be bought (or, if negative, tokens that must be sold) to move
   * the spot price to `targetPrice`, ignoring fees. Uses the closed form for a
   * constant-product pool:
   *
   *   paxReserve' = sqrt(k * targetPrice)   tokenReserve' = sqrt(k / targetPrice)
   */
  reservesForPrice(targetPrice: number): { paxReserve: number; tokenReserve: number } {
    const paxReserve = Math.sqrt(this.k * targetPrice)
    const tokenReserve = Math.sqrt(this.k / targetPrice)
    return { paxReserve, tokenReserve }
  }
}
