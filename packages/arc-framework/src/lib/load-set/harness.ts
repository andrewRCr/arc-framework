/** Harness identifiers that affect compaction-recovery context projection. */
export const LOAD_SET_HARNESSES = ["claude-code", "codex-cli"] as const;

/** Harnesses with a known repository-root instruction file. */
export type LoadSetHarness = (typeof LOAD_SET_HARNESSES)[number];

/** Parse an untrusted harness value into ARC's recovery-load-set vocabulary. */
export function parseLoadSetHarness(value: unknown): LoadSetHarness | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return (LOAD_SET_HARNESSES as readonly string[]).includes(trimmed)
    ? trimmed as LoadSetHarness
    : null;
}
