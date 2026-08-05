# Notes: Staleness-Guard Hard-Fail Policy

Contents:

- Rejected alternatives not foreclosed by the spec's Decisions
- Prior-art survey

---

## Rejected alternatives

The spec's Decisions and § Scope boundary foreclose the launcher, rebuild-on-invoke, a cross-process build lock,
an auto-rebuild escape-hatch environment variable, and any safe-list. Three further alternatives were considered
and rejected during design; they are recorded here because both of the spec's revisit triggers would reopen this
territory, and a reader acting on one should not have to re-derive them.

- **Affirm the mutator-only line.** Keep warn-and-proceed for advisory classifiers and document the asymmetry as
  deliberate. Rejected: it preserves a fail-open default, and the enumeration is already under-inclusive even for
  self-evident mutators, so the line is not being held in practice.

- **Promote feeds-later-state classifiers.** Add `housekeep check` / `errand check` and any advisory whose output
  drives a later mutating decision. Rejected: it makes the enumeration larger and its boundary vaguer without
  changing the property that lets it drift.

- **In-process re-exec, no launcher.** Keep the freshness check inside the bundle and spawn a replacement process
  after rebuilding. Its only advantage over a launcher is leaving the package `bin` field untouched. It costs
  argv, stdio, exit-code, and signal handling plus a recursion guard, and it leaves the self-reference in place
  rather than escaping it — the entry point is still the artifact being judged.

## Prior-art survey

**This survey came from an external research pass that ran without a verification stage.** The citations are
sourced but unaudited, and two of its three research threads flagged their own weaker claims. It is corroborative
only: every rejection above and in the spec stands on the drift argument independently. Re-check any specific
claim before leaning on it.

Across build systems (`make`, Bazel, Gradle, Ninja), transparent-rebuild runners (`cargo run`, `go run`, `sbt`,
`dotnet run`), and drift guards (Rails and Django migration checks, `npm ci`, `yarn --immutable`, Cargo
`--locked`, Go `-mod=readonly`, Terraform state and saved-plan checks, Alembic), no surveyed tool classifies
per-operation safety against a staleness condition at runtime. The distinctions that do exist — `npm ci` versus
`npm install`, `go build` versus `go mod tidy` — are coarse, fixed at design time, and attached to a command's
declared purpose rather than to a risk judgment.

The axis those tools use is whether the tool can fully remedy the staleness itself without external side effects:
build systems and runners rebuild; migration, lockfile, and state-version guards refuse, because their remedy
touches state that is external and hard to reverse. Rebuilding a gitignored bundle from committed source sits in
the first category — but every tool in that category is an outer runner distinct from the artifact it rebuilds.
The precedent supports transparent rebuild where a trusted outer core already exists; it does not price building
one. That distinction is the spec's Decision 9.

Two contrasts worth keeping:

- **Rails versus Django.** Rails hard-fails on pending migrations, but only inside request-serving middleware;
  Django warns and starts anyway. Two frameworks reach opposite wholesale defaults on an identical problem —
  a caution against treating either default as obviously correct.
- **PEP 552.** Python's move from timestamp-based to hash-based `.pyc` invalidation was made for precisely the
  reason the content-hash stamp was added here. Source: `https://peps.python.org/pep-0552/`.
