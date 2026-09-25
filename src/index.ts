/**
 * Pax — a pump.fun-style launchpad that turns X/Twitter accounts into coins.
 *
 * Public SDK surface. Import from here to embed the engine in a backend,
 * worker, or bot:
 *
 *   import { PaxLaunchpad, MockSocialOracle } from 'pax-launchpad'
 */
export { PaxLaunchpad } from './launchpad'
export type { LaunchParams, SyncResult } from './launchpad'
export { SocialCoin } from './social-coin'
export { MarketCapModel } from './market-cap'
export { ConstantProductAmm } from './amm'
export { MockSocialOracle, normalize } from './social-oracle'
export type { SocialOracle } from './social-oracle'
export { DEFAULT_LAUNCHPAD_CONFIG, DEFAULT_MARKET_CAP_CONFIG } from './config'
export * from './types'
