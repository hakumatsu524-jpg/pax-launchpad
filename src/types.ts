/**
 * Shared domain types for the Pax launchpad.
 *
 * Money is modeled with plain JS numbers for readability. A production
 * on-chain implementation would use integer base units (lamports / raw token
 * amounts) with BigInt to avoid floating point drift.
 */

export type Handle = string

/** A snapshot of an X/Twitter account's social metrics. */
export interface SocialMetrics {
  /** Account handle without the leading "@". */
  handle: Handle
  followers: number
  /** Cumulative likes the account has received across its posts. */
  likes: number
  /** Unix epoch (ms) the metrics were observed. */
  fetchedAt: number
}

/**
 * Parameters that turn social metrics into a fair, fully-diluted market cap.
 *
 *   fairMarketCap = baseMarketCap + paxPerPoint * (followers + likes * likeWeight) ^ scalingExponent
 */
export interface MarketCapConfig {
  /** One like counts as this many engagement points relative to a follower. */
  likeWeight: number
  /** PAX of market cap per engagement point (before diminishing returns). */
  paxPerPoint: number
  /** Floor market cap in PAX so a brand new account is not valued at zero. */
  baseMarketCap: number
  /** Diminishing-returns exponent in (0, 1]. 1 = linear, 0.85 = mild taper. */
  scalingExponent: number
}

/** Global launchpad economics. */
export interface LaunchpadConfig {
  /** Symbol of the platform coin that funds everything (e.g. "PAX"). */
  mainCoinSymbol: string
  /** Fixed supply minted for every launched social coin. */
  totalSupplyPerCoin: number
  /** Fraction of supply seeded into the AMM as protocol-owned liquidity. */
  initialFloatFraction: number
  /** PAX drawn from the main-coin treasury as each coin's creator-fund budget. */
  creatorFundsPerLaunch: number
  /** Swap fee in basis points (100 = 1%) kept in the pool. */
  tradeFeeBps: number
  /** Max PAX of creator funds deployed in a single metric sync. */
  rebalanceMaxSpendPerSync: number
  /** If true, the treasury sells creator-held tokens when an account declines. */
  allowTreasurySell: boolean
  /** Social-metric → market-cap model parameters. */
  market: MarketCapConfig
}

export type TradeSide = 'buy' | 'sell' | 'creator-buy' | 'creator-sell'

/** A single fill against a coin's AMM. */
export interface Trade {
  ts: number
  side: TradeSide
  trader: string
  paxAmount: number
  tokenAmount: number
  spotPriceAfter: number
}

/** A point-in-time record captured on every metric sync. */
export interface MetricSnapshot {
  ts: number
  followers: number
  likes: number
  /** Market cap implied purely by social metrics. */
  fairMarketCap: number
  /** Market cap implied by the live AMM spot price. */
  ammMarketCap: number
  spotPrice: number
  /** Creator funds deployed (+) or recovered (−) during this sync, in PAX. */
  creatorFundsFlow: number
}
