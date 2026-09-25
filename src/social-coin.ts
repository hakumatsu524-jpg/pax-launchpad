import { ConstantProductAmm } from './amm'
import type { MetricSnapshot, SocialMetrics, Trade } from './types'

export interface SocialCoinInit {
  handle: string
  symbol: string
  totalSupply: number
  amm: ConstantProductAmm
  metrics: SocialMetrics
  /** PAX budget available to defend/grow this coin via creator-fund buys. */
  creatorFundsBudget: number
}

/**
 * A launched coin representing a single X/Twitter account.
 */
export class SocialCoin {
  readonly handle: string
  readonly symbol: string
  readonly totalSupply: number
  readonly amm: ConstantProductAmm
  readonly createdAt: number

  metrics: SocialMetrics

  /** Remaining creator-fund budget (PAX) still available to deploy. */
  creatorFundsRemaining: number
  /** PAX of creator funds already spent buying this coin. */
  creatorFundsDeployed = 0
  /** Tokens the treasury currently holds from creator-fund buys. */
  creatorTokenHoldings = 0

  /** Balances held by external traders, keyed by trader id. */
  readonly holders = new Map<string, number>()

  readonly trades: Trade[] = []
  readonly history: MetricSnapshot[] = []

  constructor(init: SocialCoinInit) {
    this.handle = init.handle
    this.symbol = init.symbol
    this.totalSupply = init.totalSupply
    this.amm = init.amm
    this.metrics = init.metrics
    this.creatorFundsRemaining = init.creatorFundsBudget
    this.createdAt = Date.now()
  }

  /** Live market cap implied by the AMM spot price. */
  ammMarketCap(): number {
    return this.amm.spotPrice() * this.totalSupply
  }

  /** Tokens circulating outside the AMM pool (held by traders + treasury). */
  circulatingSupply(): number {
    return this.totalSupply - this.amm.tokenReserve
  }

  balanceOf(trader: string): number {
    return this.holders.get(trader) ?? 0
  }

  credit(trader: string, tokens: number): void {
    this.holders.set(trader, this.balanceOf(trader) + tokens)
  }

  debit(trader: string, tokens: number): void {
    const balance = this.balanceOf(trader)
    if (tokens > balance + 1e-9) {
      throw new Error(
        `@${this.handle}: ${trader} tried to sell ${tokens} but holds ${balance}`,
      )
    }
    this.holders.set(trader, balance - tokens)
  }

  record(trade: Trade): void {
    this.trades.push(trade)
  }
}
