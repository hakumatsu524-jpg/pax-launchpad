import type { MarketCapConfig, SocialMetrics } from './types'

/**
 * Converts an account's social metrics into a fair market cap in PAX.
 *
 * This is the heart of Pax: a coin is not priced by speculation alone but is
 * anchored to how many followers and likes the underlying account has earned.
 */
export class MarketCapModel {
  constructor(private readonly config: MarketCapConfig) {}

  /** Raw engagement score before diminishing returns. */
  engagementScore(metrics: SocialMetrics): number {
    return metrics.followers + metrics.likes * this.config.likeWeight
  }

  /** Fair, fully-diluted market cap in PAX implied by the social metrics. */
  marketCap(metrics: SocialMetrics): number {
    const score = Math.max(0, this.engagementScore(metrics))
    const scaled = Math.pow(score, this.config.scalingExponent)
    return this.config.baseMarketCap + this.config.paxPerPoint * scaled
  }

  /** Fair spot price = fair market cap spread across the full token supply. */
  fairPrice(metrics: SocialMetrics, totalSupply: number): number {
    return this.marketCap(metrics) / totalSupply
  }
}
