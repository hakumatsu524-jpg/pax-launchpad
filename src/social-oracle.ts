import type { Handle, SocialMetrics } from './types'

/**
 * Source of truth for an account's followers and likes.
 *
 * The launchpad depends only on this interface, so the mock below can be
 * swapped for a real X/Twitter API adapter without touching the engine.
 */
export interface SocialOracle {
  fetch(handle: Handle): Promise<SocialMetrics>
}

/**
 * In-memory oracle for local runs, simulations, and tests. Metrics are set
 * explicitly with `set()` or nudged with `grow()`.
 */
export class MockSocialOracle implements SocialOracle {
  private readonly store = new Map<Handle, SocialMetrics>()

  constructor(seed: Array<Pick<SocialMetrics, 'handle' | 'followers' | 'likes'>> = []) {
    for (const s of seed) this.set(s.handle, s.followers, s.likes)
  }

  set(handle: Handle, followers: number, likes: number): SocialMetrics {
    const metrics: SocialMetrics = {
      handle: normalize(handle),
      followers: Math.max(0, Math.floor(followers)),
      likes: Math.max(0, Math.floor(likes)),
      fetchedAt: Date.now(),
    }
    this.store.set(metrics.handle, metrics)
    return metrics
  }

  /** Apply an absolute delta to the stored metrics (can be negative). */
  grow(handle: Handle, followersDelta: number, likesDelta: number): SocialMetrics {
    const current = this.store.get(normalize(handle))
    const followers = (current?.followers ?? 0) + followersDelta
    const likes = (current?.likes ?? 0) + likesDelta
    return this.set(handle, followers, likes)
  }

  async fetch(handle: Handle): Promise<SocialMetrics> {
    const metrics = this.store.get(normalize(handle))
    if (!metrics) {
      throw new Error(`No social metrics known for @${normalize(handle)}`)
    }
    return { ...metrics, fetchedAt: Date.now() }
  }
}

/** Strip a leading "@" and lowercase so lookups are stable. */
export function normalize(handle: Handle): Handle {
  return handle.replace(/^@/, '').trim().toLowerCase()
}
