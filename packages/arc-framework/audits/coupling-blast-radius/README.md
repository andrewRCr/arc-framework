# Coupling Blast-Radius Audit — Checked-in Artifacts

Machine inputs and results for the repository coupling audit. The audit's contract, scan, and projection logic
lives under `packages/arc-framework/src/lib/coupling-audit/`; the executable entry point is
`npm run audit:coupling`.

- `manifest.json` — coupling class definitions and the audit input manifest.
- `routing-ledger.json` — owner finding packets and their routing state; binds every packet to the canonical
  scan-result digest (`resultDigest`).

## Scan corpus (`scan-result.json`) — retired from the tracked tip

The full canonical scan corpus (63MB raw JSON: every classified, dismissed, and unresolved candidate with
excerpt, position, and per-candidate digest) is deliberately **not tracked** at the tip: it exceeded the
repository's large-file guard and re-triggered the guard on every merge of `main` into a live branch. Its
evidence value is unchanged — the corpus is digest-pinned and remains permanently retrievable from history.

- **Canonical digest (SHA-256):** `8ff94473a49cb4a55ba79626d27c9e420770cf6a329e63ac95b332f47cc9956c`
  (also recorded as `resultDigest` in `routing-ledger.json`)

- **Retrieve the exact corpus from history:**

  ```sh
  git show f96cf4991:packages/arc-framework/audits/coupling-blast-radius/scan-result.json > scan-result.json
  sha256sum scan-result.json   # must match the canonical digest above
  ```

- **Regenerate:** check out the same commit and run:

  ```sh
  npm run audit:coupling -- \
    --manifest packages/arc-framework/audits/coupling-blast-radius/manifest.json \
    --output packages/arc-framework/audits/coupling-blast-radius/scan-result.json
  sha256sum packages/arc-framework/audits/coupling-blast-radius/scan-result.json
  ```

  Canonical JSON serialization reproduces the corpus; the printed digest must match the canonical digest above.
  A run at any later commit produces a _new_ corpus for the then-current tree, not this one.

Evidence anchors of the form `scan-result.json#class-<id>` (used by the routing ledger's packets and by
routed planning captures) resolve into this corpus: retrieve it as above, then filter `candidates.classified`
entries whose `classIds` include `<id>`.

A retrieved or regenerated local copy is covered by this directory's `.gitignore` so it cannot be re-staged
accidentally.
