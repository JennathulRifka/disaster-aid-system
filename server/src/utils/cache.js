// Tiny in-memory cache so public endpoints that call out to external sites
// (DMC, the river-gauge proxy) or run expensive Firestore aggregations don't
// redo that work on every single page load.
const store = new Map();

/**
 * Returns the cached value for `key` if still fresh, otherwise calls
 * fetcher() and caches the result.
 *
 * Stores the in-flight PROMISE, not just the resolved value, and stores it
 * synchronously before the first await — this is the whole point. A
 * concurrent-load test found that the earlier version (cache the resolved
 * value only) let every concurrent cache-miss request independently call
 * fetcher(), since none of them saw a cache entry yet — a classic "cache
 * stampede": 50 simultaneous requests to a cold cache triggered 50
 * full-collection Firestore scans instead of 1. Storing the promise means
 * every concurrent caller past the first gets the same in-flight fetch.
 */
function getCached(key, ttlMs, fetcher) {
  const cached = store.get(key);
  const now = Date.now();
  if (cached && now - cached.timestamp < ttlMs) {
    return cached.promise;
  }
  const promise = Promise.resolve().then(fetcher);
  store.set(key, { promise, timestamp: now });
  // Don't let a failed fetch poison the cache for the rest of the TTL —
  // evict immediately so the next call retries instead of re-throwing a
  // stale rejection.
  promise.catch(() => store.delete(key));
  return promise;
}

/** Evicts a cache entry immediately, so the next getCached() call for that
 * key re-fetches instead of serving a stale value for the rest of its TTL —
 * used after the admin "Retrain model" button writes a fresh flood risk
 * model, so the cached predictions (computed against the old model) don't
 * linger for up to 6 more hours. */
function invalidate(key) {
  store.delete(key);
}

module.exports = { getCached, invalidate };
