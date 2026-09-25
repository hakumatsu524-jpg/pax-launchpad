import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConstantProductAmm } from './amm'
import { DEFAULT_MARKET_CAP_CONFIG } from './config'
import { PaxLaunchpad } from './launchpad'
import { MarketCapModel } from './market-cap'
import { MockSocialOracle } from './social-oracle'

const now = Date.now()

test('market cap grows with followers and likes', () => {
  const model = new MarketCapModel(DEFAULT_MARKET_CAP_CONFIG)
  const small = model.marketCap({ handle: 'a', followers: 100, likes: 100, fetchedAt: now })
  const big = model.marketCap({ handle: 'b', followers: 1_000_000, likes: 5_000_000, fetchedAt: now })
  assert.ok(big > small)
  assert.ok(small >= DEFAULT_MARKET_CAP_CONFIG.baseMarketCap)
})

test('AMM spot price rises on buys and preserves k', () => {
  const amm = new ConstantProductAmm(1_000, 1_000_000, 0)
  const before = amm.spotPrice()
  const kBefore = amm.k
  amm.buy(500)
  assert.ok(amm.spotPrice() > before)
  assert.ok(Math.abs(amm.k - kBefore) / kBefore < 1e-9)
})

test('reservesForPrice targets the requested spot price', () => {
  const amm = new ConstantProductAmm(1_000, 1_000_000, 0)
  const target = amm.spotPrice() * 4
  const { paxReserve, tokenReserve } = amm.reservesForPrice(target)
  assert.ok(Math.abs(paxReserve / tokenReserve - target) < 1e-9)
})

test('launch draws from treasury and opens at fair valuation', async () => {
  const oracle = new MockSocialOracle([{ handle: 'naval', followers: 2_000_000, likes: 8_000_000 }])
  const pax = new PaxLaunchpad(oracle, 1_000_000)
  const treasuryBefore = pax.treasuryBalance
  const coin = await pax.launch({ handle: 'naval', symbol: 'NAVAL' })

  assert.ok(pax.treasuryBalance < treasuryBefore)
  const fair = pax.model.marketCap(coin.metrics)
  // Opening AMM market cap should match the social fair valuation.
  assert.ok(Math.abs(coin.ammMarketCap() - fair) / fair < 1e-6)
})

test('sync deploys creator funds to lift market cap toward fair value', async () => {
  const oracle = new MockSocialOracle([{ handle: 'nobody', followers: 100, likes: 100 }])
  const pax = new PaxLaunchpad(oracle, 1_000_000)
  const coin = await pax.launch({ handle: 'nobody', symbol: 'NOBODY' })
  const mcapBefore = coin.ammMarketCap()

  oracle.grow('nobody', 500_000, 5_000_000)
  const { snapshot } = await pax.sync('nobody')

  assert.ok(snapshot.creatorFundsFlow > 0, 'expected creator funds to be deployed')
  assert.ok(coin.ammMarketCap() > mcapBefore, 'expected market cap to rise')
  assert.ok(coin.creatorTokenHoldings > 0, 'treasury should hold bought tokens')
})

test('traders can buy and sell against the pool', async () => {
  const oracle = new MockSocialOracle([{ handle: 'nobody', followers: 1_000, likes: 1_000 }])
  const pax = new PaxLaunchpad(oracle, 1_000_000)
  await pax.launch({ handle: 'nobody', symbol: 'NOBODY' })

  const tokens = pax.buy('nobody', 100, 'degen')
  assert.ok(tokens > 0)
  assert.equal(pax.get('nobody').balanceOf('degen'), tokens)

  const paxOut = pax.sell('nobody', tokens, 'degen')
  assert.ok(paxOut > 0)
  assert.ok(pax.get('nobody').balanceOf('degen') < 1e-6)
  // Round-trip loses money to fees.
  assert.ok(paxOut < 100)
})

test('cannot sell more than held', async () => {
  const oracle = new MockSocialOracle([{ handle: 'nobody', followers: 1_000, likes: 1_000 }])
  const pax = new PaxLaunchpad(oracle, 1_000_000)
  await pax.launch({ handle: 'nobody', symbol: 'NOBODY' })
  assert.throws(() => pax.sell('nobody', 1_000, 'degen'))
})
