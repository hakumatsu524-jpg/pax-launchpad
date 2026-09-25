import type { LaunchpadConfig, MarketCapConfig } from './types'

/** Default valuation model: followers and likes drive the market cap. */
export const DEFAULT_MARKET_CAP_CONFIG: MarketCapConfig = {
  // A like is cheaper to farm than a follower, so it is worth less per unit.
  likeWeight: 0.1,
  // Each engagement point is worth 0.5 PAX of market cap at exponent 1.
  paxPerPoint: 0.5,
  // Floor so a fresh account launches with a non-zero valuation.
  baseMarketCap: 1_000,
  // Slight taper so viral spikes and follower whales matter less at the margin.
  scalingExponent: 0.9,
}

/** Default launchpad economics. */
export const DEFAULT_LAUNCHPAD_CONFIG: LaunchpadConfig = {
  mainCoinSymbol: 'PAX',
  totalSupplyPerCoin: 1_000_000_000,
  initialFloatFraction: 0.2,
  creatorFundsPerLaunch: 5_000,
  tradeFeeBps: 100,
  rebalanceMaxSpendPerSync: 2_500,
  allowTreasurySell: true,
  market: DEFAULT_MARKET_CAP_CONFIG,
}
