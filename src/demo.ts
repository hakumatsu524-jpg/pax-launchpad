import { Pax, price, type Account } from './pax'

const pax = new Pax(1_000_000)

// Launch a Twitter account as a coin.
const account: Account = { handle: 'satoshi', followers: 10_000, likes: 50_000 }
const coin = pax.launch(account, 5_000)

console.log(`Launched @${coin.handle}`)
console.log(`  market cap: ${coin.marketCap.toLocaleString()} PAX`)
console.log(`  price:      ${price(coin).toFixed(6)} PAX`)
console.log(`  treasury:   ${pax.treasury.toLocaleString()} PAX left`)

// The account goes viral — more followers and likes, higher market cap.
account.followers = 250_000
account.likes = 2_000_000
pax.sync(account)

console.log(`\n@${coin.handle} went viral`)
console.log(`  market cap: ${coin.marketCap.toLocaleString()} PAX`)
console.log(`  price:      ${price(coin).toFixed(6)} PAX`)
