/**
 * End-to-end simulation of the Pax launchpad. Run with: pnpm demo
 *
 * It launches a few accounts, grows their followers/likes over several
 * "epochs", syncs metrics (which deploys creator funds from the main coin),
 * lets a trader speculate, and prints a leaderboard.
 */
import { PaxLaunchpad } from './launchpad'
import { MockSocialOracle } from './social-oracle'
import { fmtPax, fmtPrice, fmtTokens } from './util'

async function main() {
  const oracle = new MockSocialOracle([
    { handle: 'naval', followers: 2_000_000, likes: 8_000_000 },
    { handle: 'balajis', followers: 1_000_000, likes: 4_500_000 },
    { handle: 'nobody', followers: 120, likes: 300 },
  ])

  // Main coin (PAX) treasury seeds all launches and creator funds.
  const pax = new PaxLaunchpad(oracle, 1_000_000)

  console.log(`\n=== Pax launchpad — main coin: ${pax.mainCoinSymbol} ===`)
  console.log(`Treasury: ${fmtPax(pax.treasuryBalance)} ${pax.mainCoinSymbol}\n`)

  await pax.launch({ handle: 'naval', symbol: 'NAVAL' })
  await pax.launch({ handle: 'balajis', symbol: 'BALAJI' })
  await pax.launch({ handle: 'nobody', symbol: 'NOBODY' })

  console.log('Launched NAVAL, BALAJI, NOBODY')
  console.log(`Treasury after launches: ${fmtPax(pax.treasuryBalance)} ${pax.mainCoinSymbol}\n`)

  // A degen trader apes into NOBODY early.
  const bought = pax.buy('nobody', 250, 'degen')
  console.log(`degen bought ${fmtTokens(bought)} NOBODY for 250 ${pax.mainCoinSymbol}\n`)

  // Simulate three epochs of social growth, syncing each time.
  const epochs = [
    { label: 'epoch 1: nobody goes viral', grow: { nobody: [50_000, 900_000] } },
    { label: 'epoch 2: steady gains', grow: { naval: [50_000, 500_000], nobody: [200_000, 3_000_000] } },
    { label: 'epoch 3: nobody keeps climbing', grow: { nobody: [500_000, 6_000_000] } },
  ] as const

  for (const epoch of epochs) {
    for (const [handle, [df, dl]] of Object.entries(epoch.grow)) {
      oracle.grow(handle, df, dl)
    }
    await pax.syncAll()
    console.log(`--- ${epoch.label} ---`)
    printLeaderboard(pax)
    console.log()
  }

  // degen takes profit.
  const proceeds = pax.sell('nobody', bought, 'degen')
  console.log(`degen sold their NOBODY for ${fmtPax(proceeds)} ${pax.mainCoinSymbol} (cost 250)\n`)
}

function printLeaderboard(pax: PaxLaunchpad) {
  for (const coin of pax.leaderboard()) {
    const fair = pax.model.marketCap(coin.metrics)
    console.log(
      `  $${coin.symbol.padEnd(7)} @${coin.handle.padEnd(10)} ` +
        `followers=${coin.metrics.followers.toLocaleString().padStart(9)} ` +
        `likes=${coin.metrics.likes.toLocaleString().padStart(10)} | ` +
        `mcap=${fmtPax(fair).padStart(12)} ${pax.mainCoinSymbol} ` +
        `price=${fmtPrice(coin.amm.spotPrice())} ` +
        `funds=${fmtPax(coin.creatorFundsDeployed)}/${fmtPax(
          coin.creatorFundsDeployed + coin.creatorFundsRemaining,
        )}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
