/**
 * Mirrors server/src/utils/deliveryChats.js's chatIdFor() exactly. A
 * delivery's donor<->volunteer / volunteer<->victim chat id is versioned
 * once that delivery has been handed off to a different volunteer (see
 * "Fellow travellers" Phase 2 in CLAUDE.md) — so every page that opens one
 * of these chats needs to compute the CURRENT id from the delivery's own
 * `handoffVersion`, not just `${deliveryId}_${pairKey}`. A missing or zero
 * handoffVersion (every delivery that's never been handed off, i.e. the
 * entire pre-Phase-2 installed base) produces byte-for-byte the same id
 * this app has always used.
 */
export function deliveryChatId(deliveryId: string, pairKey: string, handoffVersion?: number): string {
  return handoffVersion && handoffVersion > 0 ? `${deliveryId}_v${handoffVersion}_${pairKey}` : `${deliveryId}_${pairKey}`;
}
