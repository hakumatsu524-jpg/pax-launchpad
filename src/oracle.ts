// Social oracle — nudges a coin's traded price toward its social fair value.
//
// The bonding curve lets traders push the price anywhere, but a Pax coin is
// meant to track the account's real reach. The oracle periodically rebalances
// the curve so the traded market cap drifts a fraction of the way toward the
// fair (followers + likes) cap, without ever teleporting it there.

import type { Coin } from './pax'

// Move the traded cap `strength` of the way toward fair value (0..1).
// Rebalancing keeps the curve's k constant, so no PAX is created or destroyed.
export function nudge(coin: Coin, strength = 0.25): void {
  if (strength <= 0) return
  const s = Math.min(strength, 1)

  const targetCap = coin.marketCap + (coin.fairCap - coin.marketCap) * s
  const targetPrice = targetCap / coin.supply

  // Keep k = paxReserve * tokenReserve fixed while setting price = pax/token.
  // => paxReserve = sqrt(k * targetPrice), tokenReserve = sqrt(k / targetPrice).
  const k = coin.paxReserve * coin.tokenReserve
  coin.paxReserve = Math.sqrt(k * targetPrice)
  coin.tokenReserve = Math.sqrt(k / targetPrice)
}

// Advance an account's reach one "tick" using simple viral growth, then nudge.
export type ViralParams = {
  followerGrowth: number // fractional follower growth per tick
  likesPerFollower: number // likes gained per follower this tick
}

export function tick(
  coin: Coin,
  account: { handle: string; followers: number; likes: number },
  rebalance: () => void,
  viral: ViralParams,
): void {
  account.followers = Math.round(account.followers * (1 + viral.followerGrowth))
  account.likes += Math.round(account.followers * viral.likesPerFollower)
  rebalance() // caller wires this to pax.sync(account) to refresh fairCap
  nudge(coin)
}
