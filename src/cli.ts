/**
 * Interactive REPL for the Pax launchpad. Run with: pnpm cli
 *
 * State lives in memory for the session. Type `help` for commands.
 */
import * as readline from 'node:readline'
import { PaxLaunchpad } from './launchpad'
import { MockSocialOracle } from './social-oracle'
import { fmtPax, fmtPrice, fmtTokens } from './util'

const oracle = new MockSocialOracle()
const pax = new PaxLaunchpad(oracle, 1_000_000)

const HELP = `
Pax launchpad — commands:
  help                                 show this help
  treasury                             show main-coin (${pax.mainCoinSymbol}) treasury balance
  metrics <handle> <followers> <likes> set an account's social metrics
  launch  <handle> <SYMBOL>            launch an account as a coin (metrics required first)
  sync    <handle>                     refresh metrics + deploy creator funds
  syncall                              sync every launched coin
  buy     <handle> <pax> [trader]      buy a coin with ${pax.mainCoinSymbol}
  sell    <handle> <tokens> [trader]   sell a coin back to the pool
  info    <handle>                     detailed stats for one coin
  list                                 leaderboard by social market cap
  quit                                 exit
`

function print(coinHandle: string) {
  const coin = pax.get(coinHandle)
  const fair = pax.model.marketCap(coin.metrics)
  console.log(`
$${coin.symbol} — @${coin.handle}
  followers            ${coin.metrics.followers.toLocaleString()}
  likes                ${coin.metrics.likes.toLocaleString()}
  fair market cap      ${fmtPax(fair)} ${pax.mainCoinSymbol}
  amm market cap       ${fmtPax(coin.ammMarketCap())} ${pax.mainCoinSymbol}
  spot price           ${fmtPrice(coin.amm.spotPrice())} ${pax.mainCoinSymbol}/token
  pool                 ${fmtPax(coin.amm.paxReserve)} ${pax.mainCoinSymbol} / ${fmtTokens(coin.amm.tokenReserve)} tokens
  creator funds        ${fmtPax(coin.creatorFundsDeployed)} deployed, ${fmtPax(coin.creatorFundsRemaining)} left
  treasury holdings    ${fmtTokens(coin.creatorTokenHoldings)} tokens
  trades               ${coin.trades.length}`)
}

function leaderboard() {
  const coins = pax.leaderboard()
  if (coins.length === 0) return console.log('No coins launched yet.')
  console.log('\nrank  symbol   handle        followers      likes        mcap (' + pax.mainCoinSymbol + ')')
  coins.forEach((coin, i) => {
    console.log(
      `${String(i + 1).padStart(4)}  ` +
        `$${coin.symbol.padEnd(7)} @${coin.handle.padEnd(12)} ` +
        `${coin.metrics.followers.toLocaleString().padStart(10)} ` +
        `${coin.metrics.likes.toLocaleString().padStart(12)} ` +
        `${fmtPax(pax.model.marketCap(coin.metrics)).padStart(14)}`,
    )
  })
}

async function handle(line: string): Promise<void> {
  const [cmd, ...args] = line.trim().split(/\s+/)
  if (!cmd) return

  switch (cmd) {
    case 'help':
      return void console.log(HELP)
    case 'treasury':
      return void console.log(`Treasury: ${fmtPax(pax.treasuryBalance)} ${pax.mainCoinSymbol}`)
    case 'metrics': {
      const [h, f, l] = args
      const m = oracle.set(h, Number(f), Number(l))
      return void console.log(`@${m.handle}: ${m.followers.toLocaleString()} followers, ${m.likes.toLocaleString()} likes`)
    }
    case 'launch': {
      const [h, sym] = args
      const coin = await pax.launch({ handle: h, symbol: sym })
      console.log(`Launched $${coin.symbol} for @${coin.handle}. Treasury: ${fmtPax(pax.treasuryBalance)} ${pax.mainCoinSymbol}`)
      return print(coin.handle)
    }
    case 'sync': {
      const { snapshot } = await pax.sync(args[0])
      const flow = snapshot.creatorFundsFlow
      const verb = flow > 0 ? 'deployed' : flow < 0 ? 'recovered' : 'moved'
      console.log(`Synced @${args[0]}: creator funds ${verb} ${fmtPax(Math.abs(flow))} ${pax.mainCoinSymbol}`)
      return print(args[0])
    }
    case 'syncall': {
      await pax.syncAll()
      return leaderboard()
    }
    case 'buy': {
      const [h, amount, trader] = args
      const tokens = pax.buy(h, Number(amount), trader ?? 'anon')
      return void console.log(`${trader ?? 'anon'} bought ${fmtTokens(tokens)} $${pax.get(h).symbol} for ${fmtPax(Number(amount))} ${pax.mainCoinSymbol}`)
    }
    case 'sell': {
      const [h, amount, trader] = args
      const out = pax.sell(h, Number(amount), trader ?? 'anon')
      return void console.log(`${trader ?? 'anon'} sold ${fmtTokens(Number(amount))} $${pax.get(h).symbol} for ${fmtPax(out)} ${pax.mainCoinSymbol}`)
    }
    case 'info':
      return print(args[0])
    case 'list':
      return leaderboard()
    case 'quit':
    case 'exit':
      rl.close()
      return
    default:
      console.log(`Unknown command: ${cmd}. Type "help".`)
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'pax> ' })

console.log(`Pax launchpad REPL. Main coin: ${pax.mainCoinSymbol}. Type "help" to begin.`)
rl.prompt()
rl.on('line', async (line) => {
  try {
    await handle(line)
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
  }
  rl.prompt()
})
rl.on('close', () => {
  console.log('bye')
  process.exit(0)
})
