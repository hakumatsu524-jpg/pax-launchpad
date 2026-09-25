// Pax — a tiny launchpad where a Twitter account becomes a coin.
// The coin's market cap is driven by the account's followers and likes.
// New coins are seeded with "creator funds" taken from the main PAX coin.

export type Account = {
  handle: string
  followers: number
  likes: number
}

export type Coin = {
  handle: string
  supply: number // total tokens
  paxFunded: number // PAX seeded into this coin from the treasury
  marketCap: number // in PAX, from followers + likes
}

// Market cap = base + (followers + likes * likeWeight) * paxPerPoint.
// Followers count more than likes because likes are easier to farm.
export function marketCap(account: Account): number {
  const BASE = 1_000
  const LIKE_WEIGHT = 0.1
  const PAX_PER_POINT = 0.5
  const score = account.followers + account.likes * LIKE_WEIGHT
  return BASE + score * PAX_PER_POINT
}

export function price(coin: Coin): number {
  return coin.marketCap / coin.supply
}

export class Pax {
  treasury: number // PAX available to seed new coins
  coins: Coin[] = []

  constructor(treasury = 1_000_000) {
    this.treasury = treasury
  }

  // Launch a Twitter account as a coin, seeded with creator funds from PAX.
  launch(account: Account, creatorFunds = 5_000): Coin {
    if (creatorFunds > this.treasury) {
      throw new Error('not enough PAX in the treasury')
    }
    this.treasury -= creatorFunds

    const coin: Coin = {
      handle: account.handle,
      supply: 1_000_000_000,
      paxFunded: creatorFunds,
      marketCap: marketCap(account),
    }
    this.coins.push(coin)
    return coin
  }

  // Re-price a coin after its account gains (or loses) followers and likes.
  sync(account: Account): Coin {
    const coin = this.coins.find((c) => c.handle === account.handle)
    if (!coin) throw new Error(`no coin for @${account.handle}`)
    coin.marketCap = marketCap(account)
    return coin
  }
}
