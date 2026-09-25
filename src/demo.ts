import { Pax, type Account } from './pax'
import { nudge, tick } from './oracle'

const pax = new Pax(1_000_000, { feeBps: 100 })

function pax_(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} PAX`
}
function report(handle: string): void {
  const c = pax.coin(handle)
  console.log(
    `  @${handle}  cap ${pax_(c.marketCap)}  fair ${pax_(c.fairCap)}  ` +
      `price ${c.price.toFixed(6)}  circ ${(c.circulating / 1e6).toFixed(1)}M`,
  )
}

// 1. Launch a Twitter/X account as a coin, seeded with creator funds.
const acct: Account = { handle: 'satoshi', followers: 10_000, likes: 50_000 }
const coin = pax.launch(acct, 5_000)
console.log(`Launched @${coin.handle} with ${pax_(coin.creatorFunds)} creator funds`)
report('satoshi')

// 2. Traders pile in along the bonding curve.
console.log('\nTraders buy in:')
const buy = pax.buy('satoshi', 2_000)
console.log(`  bought ${(buy.tokens / 1e6).toFixed(2)}M tokens, fee ${pax_(buy.fee)}`)
report('satoshi')

// 3. The account goes viral — followers and likes explode.
acct.followers = 250_000
acct.likes = 2_000_000
pax.sync(acct)
console.log('\nWent viral (fair value jumps, price lags):')
report('satoshi')

// 4. The oracle rebalances the curve toward fair value.
nudge(coin, 0.5)
console.log('\nAfter oracle nudge (price catches up):')
report('satoshi')

// 5. Simulate a few viral ticks with automatic oracle rebalancing.
console.log('\nSimulating viral growth:')
for (let t = 1; t <= 3; t++) {
  tick(coin, acct, () => pax.sync(acct), { followerGrowth: 0.4, likesPerFollower: 3 })
  console.log(`  tick ${t}:`)
  report('satoshi')
}

// 6. Someone takes profit.
const sell = pax.sell('satoshi', buy.tokens)
console.log(`\nSold back ${(sell.tokens / 1e6).toFixed(2)}M tokens for ${pax_(sell.paxOut)} (fee ${pax_(sell.fee)})`)
report('satoshi')

console.log(`\nTreasury now holds ${pax_(pax.treasury)} (seed refunds + fees).`)
