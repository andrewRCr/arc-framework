/** Process-local invalidation after successful checkout-marker writes and worktree moves. */
export type CheckoutChange = { readonly kind: "marker"; readonly checkoutRoot: string }
  | { readonly kind: "move"; readonly from: string; readonly to: string };
type Listener = (change: CheckoutChange) => void;
const listeners = new Set<Listener>();

/** Observe successful checkout changes without coupling Git writers to their consumers. */
export function onCheckoutChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Notify consumers only after the corresponding filesystem or Git mutation succeeded. */
export function notifyCheckoutChange(change: CheckoutChange): void {
  for (const listener of listeners) listener(change);
}
