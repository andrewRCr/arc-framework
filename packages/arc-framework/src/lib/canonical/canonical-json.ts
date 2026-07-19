/**
 * Compatibility exports for the kernel-owned canonical JSON primitives.
 */

export {
  assertCanonicalDigest,
  canonicalDigest,
  canonicalize,
  digestBytes,
  isCanonicalDigest,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../kernel/canonical/canonical-json.js";
