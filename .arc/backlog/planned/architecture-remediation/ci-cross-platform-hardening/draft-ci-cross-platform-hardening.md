# Draft: CI & Gate Hardening

- **Cohort:** `architecture-remediation` — a theme bucket of independent CLI/codebase-health WUs; builds on
  `state-ref-write-safety`'s first scoped matrixed CI job.
- **Origin:** [internal] — assembled at the 2026-06-27 housekeep drain from three CI/quality-gate hardening
  captures taken during `state-ref-write-safety`. Membership is logical grouping, not a scheduling constraint;
  members sequence independently.
- **Purpose:** Harden the dev-repo's CI and quality-gate surface — cross-platform verifiability, supply-chain
  pinning, and a module-graph integrity gate — none individually spec-worthy, all the same CI-config /
  gate-infra character. `.github/workflows/**` and the gate/hook surface are **not** shipped framework content,
  so this is dev-repo infrastructure, not a methodology change.

- **State:** Draft — assembled 2026-06-27. `Class` [TBD]; confirm at draft-design.

---

## Facets

1. **Cross-platform CI matrix generalization + shake-out.** `.github/workflows/ci.yml` is `ubuntu-latest` only
   across every job (typecheck / test / build / lint) — no Windows/WSL/Mac matrix, so any cross-platform guarantee
   is currently CI-unverifiable. `state-ref-write-safety`'s portability criterion (exclusive-create, advisory
   lock, `process.kill(pid, 0)` liveness across Win/WSL/Mac) is the first to need it. GitHub-hosted runners are
   `ubuntu`/`windows`/`macos`; WSL is Linux syscalls (covered-by-proxy by `ubuntu`), so the load-bearing axis is
   `windows` vs `ubuntu`. Approach: (a) generalize the OS matrix from `state-ref-write-safety`'s first scoped
   matrixed job to the whole pipeline — this will shake out unrelated cross-platform test issues that then need
   resolving; (b) the matrix-coupled robustness items — fail-fast/matrix tuning, and the
   separate-config-vs-globbed test race (a raw `npx vitest run` globs unit+e2e at high concurrency and races,
   unlike the sanctioned `npm test` that runs them under separate configs). Coordinate with `cli-test-hardening` —
   its inbound buffer already tracks save/sync concurrency flakes in the integration+e2e layer (the same race
   surface). **Boundary with `ci-content-aware-depth`:** CI cost/efficiency — content-aware depth, the
   merge-safety gate, and `concurrency` cancel-in-progress — is owned there; dependency caching already ships via
   `setup-node`. This facet is scoped to cross-platform verifiability; the two share `.github/workflows/ci.yml`,
   so sequence them (rebase the later WU on the earlier). _Captured during
   `state-ref-write-safety` task generation, 2026-06-26._

2. **SHA-pin GitHub Actions + add Renovate/Dependabot.** Both workflow files reference actions by floating major
   tag (`actions/checkout@v5`, `setup-node@v5`, `setup-python@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4`)
   — mutable refs an upstream compromise can repoint (the `tj-actions/changed-files` class of supply-chain
   incident). Marginal risk here is low: every action is first-party `actions/*`, and the higher-leverage
   half — token-scope — already landed (`ci.yml` is `contents: read` + `persist-credentials: false` on all
   checkouts). Defense-in-depth, not urgent. Approach: pin each `uses:` to a full commit SHA **and** add
   Renovate/Dependabot in the same change (pinning without auto-update tooling is a maintenance regression — pins
   rot, action security patches stop landing; the bot appends a `# v5.0.1` comment so the human-readable version
   survives). Prioritize `docs.yml`'s Pages-deploy job — it runs `id-token: write` + `pages: write` (the highest
   blast radius), unlike the read-only `ci.yml` jobs. _Captured during `state-ref-write-safety` integration —
   CodeRabbit F12, deliberately deferred out of WU scope, 2026-06-27._

3. **`madge --circular` acyclic-module-graph gate.** Nothing enforces dependency-layering direction today (no
   `import/no-cycle`, no madge), so a latent import cycle can pass all gates. Surfaced live in
   `state-ref-write-safety` Task 1.2: a `sync-state-ref ↔ sync-state-merge` cycle is benign only because the
   shared bound is consumed at call-time — it would break the day an imported binding is used at module-init. The
   large `lib/user-sync/index.ts` barrel makes init-time cycle bugs easy to introduce. Approach: add
   `madge --circular src` as a quality-gate / pre-commit check — fits the repo's custom point-scanner hook style
   better than `eslint-plugin-import`'s `no-cycle` (slow and finicky with the ESM `.js`-extension + TS resolver).
   Adopting it may surface existing cycles that then need untangling (unknown blast radius — the extended-sweep
   case). Re-homed here from `USER-INBOX § Errand` at the 2026-06-27 drain: it is a code-module-graph integrity
   gate, sibling to this WU's supply-chain pinning and to the `architecture-remediation` module-split work it
   protects — a tighter fit than `quality-gate-hooks` (which is scoped to content/doc checks). _Captured during
   `state-ref-write-safety` Task 1.2 const-relocation decision, 2026-06-27._

## Open design questions

- **Tool/placement forks (facet 3):** madge vs. eslint (decided toward madge above); CI vs. pre-commit placement
  for each of the three facets (the matrix is CI-only; pinning is CI-config; the graph gate could be either).
- **Scope of the cross-platform shake-out (facet 1):** generalizing the matrix will surface unknown existing
  cross-platform failures; bound the in-scope fixes vs. what spins out.

## Scope Estimate

Small–Medium. Facets 2–3 are each Atomic-to-Small (a pinning + bot change; a single gate addition). Facet 1 is
the variable one — the matrix generalization plus whatever cross-platform failures it shakes out. `Class` likely
Light–Heavy depending on facet 1's shake-out; confirm at draft-design. May decompose if facet 1 grows.

## Continuity

- **Readiness:** stub-shaped; provenance preserved. Independent of the cohort's other members.
- **Next:** activate via `init-work-unit` → iterate via `arc-plan` → `draft-design`. First move: resolve `Class`,
  and start with facets 2–3 (determinate, small) while scoping facet 1's matrix shake-out.

---
