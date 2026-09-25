import { ConstantProductAmm } from './amm'
import { DEFAULT_LAUNCHPAD_CONFIG } from './config'
import { MarketCapModel } from './market-cap'
import { SocialCoin } from './social-coin'
import { normalize } from './social-oracle'
import type { SocialOracle } from './social-oracle'
import type { Handle, LaunchpadConfig, MetricSnapshot, SocialMetrics, Trade } from './types'

export interface LaunchParams {
  handle: Handle
  symbol: string
  /** Optional initial metrics; otherwise fetched from the oracle. */
  metrics?: Pick<SocialMetrics, 'followers' | 'likes'>
}

export interface SyncResult {
  coin: SocialCoin
  snapshot: MetricSnapshot
}

/**
 * The Pax launchpad.
 *
 * A single "main coin" (PAX) treasury funds everything. Launching an account
 * mints a fixed-supply social coin, seeds an AMM with protocol-owned liquidity,
 * and reserves a creator-fund budget. On every metric sync the launchpad values
 * the account from its followers/likes and deploys creator funds to move the
 * coin's market cap toward that fair value.
 */
export class PaxLaunchpad {
  readonly config: LaunchpadConfig
  readonly model: MarketCapModel

  /** PAX held by the main coin, available to allocate to new launches. */
  private treasury: number

  private readonly coins = new Map<Handle, SocialCoin>()

  constructor(
    private readonly oracle: SocialOracle,
    treasury: number,
    config: LaunchpadConfig = DEFAULT_LAUNCHPAD_CONFIG,
  ) {
    this.config = config
    this.model = new MarketCapModel(config.market)
    this.treasury = treasury
  }

  get treasuryBalance(): number {
    return this.treasury
  }

  get mainCoinSymbol(): string {
    return this.config.mainCoinSymbol
  }

  list(): SocialCoin[] {
    return [...this.coins.values()]
  }

  get(handle: Handle): SocialCoin {
    const coin = this.coins.get(normalize(handle))
    if (!coin) throw new Error(`@${normalize(handle)} has not been launched`)
    return coin
  }

  /** Coins ranked by fair (social) market cap, highest first. */
  leaderboard(): SocialCoin[] {
    return this.list().sort(
      (a, b) => this.model.marketCap(b.metrics) - this.model.marketCap(a.metrics),
    )
  }

  /**
   * Launch an X/Twitter account as a coin.
   *
   * Draws protocol-owned liquidity plus a creator-fund budget from the main
   * coin treasury, then seeds the AMM so the coin opens at its fair valuation.
   */
  async launch(params: LaunchParams): Promise<SocialCoin> {
    const handle = normalize(params.handle)
    if (this.coins.has(handle)) throw new Error(`@${handle} is already launched`)

    const metrics = params.metrics
      ? { handle, followers: params.metrics.followers, likes: params.metrics.likes, fetchedAt: Date.now() }
      : await this.oracle.fetch(handle)

    const { totalSupplyPerCoin, initialFloatFraction, creatorFundsPerLaunch } = this.config

    const openingPrice = this.model.fairPrice(metrics, totalSupplyPerCoin)
    const floatTokens = totalSupplyPerCoin * initialFloatFraction
    const seedLiquidityPax = openingPrice * floatTokens

    const totalDraw = seedLiquidityPax + creatorFundsPerLaunch
    if (totalDraw > this.treasury) {
      throw new Error(
        `Treasury has ${this.treasury.toFixed(2)} ${this.mainCoinSymbol}, ` +
          `launch needs ${totalDraw.toFixed(2)}`,
      )
    }
    this.treasury -= totalDraw

    const amm = new ConstantProductAmm(seedLiquidityPax, floatTokens, this.config.tradeFeeBps)
    const coin = new SocialCoin({
      handle,
      symbol: params.symbol.toUpperCase(),
      totalSupply: totalSupplyPerCoin,
      amm,
      metrics,
      creatorFundsBudget: creatorFundsPerLaunch,
    })

    this.coins.set(handle, coin)
    this.snapshot(coin, 0)
    return coin
  }

  /** Buy a social coin with PAX. Returns tokens received. */
  buy(handle: Handle, paxIn: number, trader = 'anon'): number {
    if (paxIn <= 0) throw new Error('paxIn must be positive')
    const coin = this.get(handle)
    const tokensOut = coin.amm.buy(paxIn)
    coin.credit(trader, tokensOut)
    this.logTrade(coin, { side: 'buy', trader, paxAmount: paxIn, tokenAmount: tokensOut })
    return tokensOut
  }

  /** Sell tokens of a social coin back to the AMM. Returns PAX received. */
  sell(handle: Handle, tokensIn: number, trader = 'anon'): number {
    if (tokensIn <= 0) throw new Error('tokensIn must be positive')
    const coin = this.get(handle)
    coin.debit(trader, tokensIn)
    const paxOut = coin.amm.sell(tokensIn)
    this.logTrade(coin, { side: 'sell', trader, paxAmount: paxOut, tokenAmount: tokensIn })
    return paxOut
  }

  /**
   * Refresh an account's metrics and align the coin's market cap to the fair
   * value implied by its followers and likes, using creator funds from the main
   * coin. Buys when undervalued; optionally sells treasury-held tokens when the
   * account declines.
   */
  async sync(handle: Handle): Promise<SyncResult> {
    const coin = this.get(handle)
    coin.metrics = await this.oracle.fetch(coin.handle)

    const fairPrice = this.model.fairPrice(coin.metrics, coin.totalSupply)
    const flow = this.rebalance(coin, fairPrice)
    const snapshot = this.snapshot(coin, flow)
    return { coin, snapshot }
  }

  /** Sync every launched coin (e.g. on a polling interval). */
  async syncAll(): Promise<SyncResult[]> {
    const results: SyncResult[] = []
    for (const coin of this.coins.values()) {
      results.push(await this.sync(coin.handle))
    }
    return results
  }

  /**
   * Deploy or recover creator funds to push the AMM spot price toward
   * `fairPrice`. Returns the signed PAX flow (positive = deployed into the coin,
   * negative = recovered to the creator-fund budget).
   */
  private rebalance(coin: SocialCoin, fairPrice: number): number {
    const spot = coin.amm.spotPrice()
    const cap = this.config.rebalanceMaxSpendPerSync

    if (fairPrice > spot) {
      // Undervalued vs socials → buy with creator funds to lift the market cap.
      const target = coin.amm.reservesForPrice(fairPrice)
      const paxNeeded = target.paxReserve - coin.amm.paxReserve
      const spend = Math.min(paxNeeded, coin.creatorFundsRemaining, cap)
      if (spend <= 0) return 0

      const tokensOut = coin.amm.buy(spend)
      coin.creatorFundsRemaining -= spend
      coin.creatorFundsDeployed += spend
      coin.creatorTokenHoldings += tokensOut
      this.logTrade(coin, {
        side: 'creator-buy',
        trader: 'creator-funds',
        paxAmount: spend,
        tokenAmount: tokensOut,
      })
      return spend
    }

    if (fairPrice < spot && this.config.allowTreasurySell && coin.creatorTokenHoldings > 0) {
      // Account declined → recover value by selling treasury-held tokens.
      const target = coin.amm.reservesForPrice(fairPrice)
      const tokensNeeded = target.tokenReserve - coin.amm.tokenReserve
      const tokensToSell = Math.min(tokensNeeded, coin.creatorTokenHoldings)
      if (tokensToSell <= 0) return 0

      const paxOut = coin.amm.sell(tokensToSell)
      coin.creatorTokenHoldings -= tokensToSell
      coin.creatorFundsRemaining += paxOut
      coin.creatorFundsDeployed -= paxOut
      this.logTrade(coin, {
        side: 'creator-sell',
        trader: 'creator-funds',
        paxAmount: paxOut,
        tokenAmount: tokensToSell,
      })
      return -paxOut
    }

    return 0
  }

  private logTrade(coin: SocialCoin, partial: Omit<Trade, 'ts' | 'spotPriceAfter'>): void {
    coin.record({ ...partial, ts: Date.now(), spotPriceAfter: coin.amm.spotPrice() })
  }

  private snapshot(coin: SocialCoin, creatorFundsFlow: number): MetricSnapshot {
    const snapshot: MetricSnapshot = {
      ts: Date.now(),
      followers: coin.metrics.followers,
      likes: coin.metrics.likes,
      fairMarketCap: this.model.marketCap(coin.metrics),
      ammMarketCap: coin.ammMarketCap(),
      spotPrice: coin.amm.spotPrice(),
      creatorFundsFlow,
    }
    coin.history.push(snapshot)
    return snapshot
  }
}
