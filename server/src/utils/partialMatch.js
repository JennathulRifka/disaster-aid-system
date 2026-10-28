/**
 * Pure planning step for matching one donation against one request: decides
 * how much of the donation is consumed, what is left on the donation, and how
 * the request's items change — including SPLITTING an item when the donation
 * only covers part of it, so the shortfall stays pending instead of being
 * silently closed. No Firestore access here (kept separate from
 * routes/donations.js, which imports ../config/firebase and so can't be
 * imported in a plain unit test without credentials).
 *
 * @param items            the request's items array
 * @param category         the donation's category
 * @param remainingBefore  the donation's remaining quantity (Infinity for a
 *                         legacy donation with no tracked quantity)
 * @param donationId       id to link the matched part to
 * @returns null if the request has no pending item in this category, else
 *   { updatedItems, consumedQuantity, remainingAfter, outstandingQuantity }
 */
function planMatch(items, category, remainingBefore, donationId) {
  const matchedItem = (items || []).find((item) => item.category === category && item.status === "pending");
  if (!matchedItem) return null;

  const needed = Number(matchedItem.quantity);
  const hasNeed = Number.isFinite(needed) && needed > 0;
  const neededByItem = hasNeed ? needed : remainingBefore;
  const consumedQuantity = Math.min(remainingBefore, neededByItem);

  // Partial coverage: this donation cannot cover the whole item.
  const outstandingQuantity =
    hasNeed && Number.isFinite(consumedQuantity) && consumedQuantity < needed ? needed - consumedQuantity : 0;

  const updatedItems = items.flatMap((item) => {
    if (item !== matchedItem) return [item];
    if (outstandingQuantity === 0) return [{ ...item, status: "matched", donationId }];
    return [
      { ...item, quantity: consumedQuantity, status: "matched", donationId },
      { ...item, quantity: outstandingQuantity, status: "pending", donationId: null },
    ];
  });

  // A legacy donation with no tracked quantity at all (remainingBefore is
  // Infinity) has no real balance to carry forward — treat it as single-use
  // (fully consumed by this match) rather than persisting Infinity, which
  // poisons every district-inventory total it's counted in.
  const remainingAfter = Number.isFinite(remainingBefore) ? remainingBefore - consumedQuantity : 0;

  return { updatedItems, consumedQuantity, remainingAfter, outstandingQuantity };
}

module.exports = { planMatch };
