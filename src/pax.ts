// Pax — a pump.fun-style launchpad where a Twitter/X account becomes a coin.
//
// A coin's *fair* market cap is driven by the account's followers and likes.
// The coin also trades on a constant-product bonding curve seeded with
// "creator funds" taken from the main PAX treasury, so its *traded* price can
// drift above or below fair value. A social oracle nudges the two together.

export type Account = {
  handle: string
  followers: number
  likes: number
}

export type Trade = {
  side: 'buy' | 'sell'
  paxIn: number // PAX spent (buy) — 0 for sells
  paxOut: number // PAX received (sell) — 0 for buys
  tokens: number // tokens moved
  fee: number // PAX fee taken by the treasury
  price: number // effective price of this trade, PAX per token
}

// Tunable launchpad parameters. Sensible defaults live in DEFAULT_PARAMS.
export type PaxParams = {
  base: number // floor market cap for a brand-new account
  likeWeight: number // a like is worth this fraction of a follower
  paxPerPoint: number // PAX of fair cap per social "point"
  supply: number // fixed token supply per coin
  feeBps: number // trading fee in basis points (100 = 1%)
}

export const DEFAULT_PARAMS: PaxParams = {
  base: 1_000,
  likeWeight: 0.1,
  paxPerPoint: 0.5,
  supply: 1_000_000_000,
  feeBps: 100,
}

// Fair market cap = base + (followers + likes * likeWeight) * paxPerPoint.
// Followers count more than likes because likes are easier to farm.
export function fairMarketCap(account: Account, params: PaxParams = DEFAULT_PARAMS): number {
  const score = account.followers + account.likes * params.likeWeight
  return params.base + score * params.paxPerPoint
}

// A coin trades on a constant-product curve: paxReserve * tokenReserve = k.
// The reserves define the live traded price; fairCap tracks social value.
export class Coin {
  readonly handle: string
  readonly supply: number
  readonly params: PaxParams

  paxReserve: number // PAX locked in the curve (creator funds + net buys)
  tokenReserve: number // tokens still held by the curve
  creatorFunds: number // PAX seeded from the treasury at launch
  fairCap: number // social fair value, in PAX
  trades: Trade[] = []

  constructor(account: Account, creatorFunds: number, params: PaxParams) {
    this.handle = account.handle
    this.supply = params.supply
    this.params = params
    this.creatorFunds = creatorFunds
    this.fairCap = fairMarketCap(account, params)

    // Seed the curve so its implied cap starts at fair value.
    // price0 = fairCap / supply; paxReserve = creatorFunds;
    // tokenReserve = paxReserve / price0.
    const price0 = this.fairCap / this.supply
    this.paxReserve = creatorFunds
    this.tokenReserve = creatorFunds / price0
  }

  // Live traded price from the curve.
  get price(): number {
    return this.paxReserve / this.tokenReserve
  }

  // Traded market cap = live price * total supply.
  get marketCap(): number {
    return this.price * this.supply
  }

  // Tokens circulating outside the curve (i.e. bought by traders).
  get circulating(): number {
    return this.supply - this.tokenReserve
  }
}

export class InsufficientTreasuryError extends Error {}
export class UnknownCoinError extends Error {}

export class Pax {
  treasury: number // PAX available to seed coins + collected fees
  readonly params: PaxParams
  private readonly byHandle = new Map<string, Coin>()

  constructor(treasury = 1_000_000, params: Partial<PaxParams> = {}) {
    this.treasury = treasury
    this.params = { ...DEFAULT_PARAMS, ...params }
  }

  get coins(): Coin[] {
    return [...this.byHandle.values()]
  }

  coin(handle: string): Coin {
    const coin = this.byHandle.get(handle)
    if (!coin) throw new UnknownCoinError(`no coin for @${handle}`)
    return coin
  }

  // Launch a Twitter/X account as a coin, seeded with creator funds from PAX.
  launch(account: Account, creatorFunds = 5_000): Coin {
    if (this.byHandle.has(account.handle)) {
      throw new Error(`@${account.handle} already launched`)
    }
    if (creatorFunds > this.treasury) {
      throw new InsufficientTreasuryError('not enough PAX in the treasury')
    }
    this.treasury -= creatorFunds
    const coin = new Coin(account, creatorFunds, this.params)
    this.byHandle.set(account.handle, coin)
    return coin
  }

  // Buy tokens with PAX along the bonding curve. Fee flows to the treasury.
  buy(handle: string, paxIn: number): Trade {
    if (paxIn <= 0) throw new Error('paxIn must be positive')
    const coin = this.coin(handle)

    const fee = (paxIn * this.params.feeBps) / 10_000
    const paxNet = paxIn - fee
    const k = coin.paxReserve * coin.tokenReserve
    const newPax = coin.paxReserve + paxNet
    const newTokens = k / newPax
    const tokensOut = coin.tokenReserve - newTokens

    coin.paxReserve = newPax
    coin.tokenReserve = newTokens
    this.treasury += fee

    const trade: Trade = { side: 'buy', paxIn, paxOut: 0, tokens: tokensOut, fee, price: paxNet / tokensOut }
    coin.trades.push(trade)
    return trade
  }

  // Sell tokens back into the curve for PAX. Fee flows to the treasury.
  sell(handle: string, tokensIn: number): Trade {
    if (tokensIn <= 0) throw new Error('tokensIn must be positive')
    const coin = this.coin(handle)
    if (tokensIn > coin.circulating) {
      throw new Error('cannot sell more than the circulating supply')
    }

    const k = coin.paxReserve * coin.tokenReserve
    const newTokens = coin.tokenReserve + tokensIn
    const newPax = k / newTokens
    const paxGross = coin.paxReserve - newPax
    const fee = (paxGross * this.params.feeBps) / 10_000
    const paxOut = paxGross - fee

    coin.paxReserve = newPax
    coin.tokenReserve = newTokens
    this.treasury += fee

    const trade: Trade = { side: 'sell', paxIn: 0, paxOut, tokens: tokensIn, fee, price: paxGross / tokensIn }
    coin.trades.push(trade)
    return trade
  }

  // Refresh a coin's social fair value after its account gains/loses reach.
  sync(account: Account): Coin {
    const coin = this.coin(account.handle)
    coin.fairCap = fairMarketCap(account, this.params)
    return coin
  }
}
