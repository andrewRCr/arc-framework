# Notes: Review Gate Enforcement Cutover

## Live hosted-Codex probe

Disposable PR #227 used unsafe Head A `ff673d16fcb8368bd6e5faae9400b3c96384823d` and fixed Head B
`ae0bcc3492a7a1221fbf803a3c9d3de421120bce`. The PR was closed without merge and its local/remote branch and
temporary worktree were removed.

- The developer-authored Head A `@codex review` acknowledged in about 28 seconds and completed in about 163 seconds.
  Review `4680130205` was `COMMENTED` on the full Head A commit. Inline P1 comment `3566397512` identified the
  deliberate path-traversal defect.
- The developer-authored Head B request acknowledged in about 14 seconds and completed clean in about 82 seconds as
  issue comment `4951380179`, not a GitHub review or check. Its body contained the clean clause and reviewed SHA
  prefix.
- Codex artifacts used bot user id `199175422` through GitHub App id `1144995`.
- The Head A thread remained outdated/unresolved after Head B's clean result. Direct reply `3566413948` linked the fix,
  after which the coordinator resolved the thread. This proves coordinator-owned settlement but not provider
  verification of the individual fix.
- ARC-App-authored trigger comment `4951414131` received response `4951414482` requiring a connected Codex account.
  The App actor cannot consume the developer's hosted subscription. This response is parser evidence only under the
  final design; terminal unavailable behavior requires an admissible unconnected actor-path qualification.

Official Codex GitHub documentation states that reviews follow repository `AGENTS.md` Review guidelines and may take
one-off focus instructions in the `@codex review` comment:
`https://learn.chatgpt.com/docs/third-party/github#customize-what-codex-reviews`.

## CodeRabbit observations

CodeRabbit submitted empty `APPROVED` review `4680146070` on Head B about 33 seconds after the coordinator replied to
and resolved the Codex thread. No CodeRabbit label, request, walkthrough, findings, or intentional invocation existed.
The repository configuration had `request_changes_workflow: true`, demonstrating that native approval can react to
conversation settlement without substantive CodeRabbit review and cannot satisfy the aggregate gate by itself.

The checked-in configuration at design time enabled automatic review only for `arc-review-gate`, disabled drafts and
automatic incremental review, and enabled commit status/failure reporting. Qualification must resolve inherited,
global, UI, keyword, and alternate automatic paths rather than trusting the repository delta alone.

## GitHub App and token evidence

- ARC App: `arc-review-gate-andrewrcr`, App id `4268856`, bot user id `302312524`, installation id `145772297`.
- Final selected-repository proof returned exactly `andrewRCr/arc-framework`; the sandbox repository was deselected.
- Permissions were metadata read, checks write, pull requests write, and statuses read, with no contents write or
  merge authority.
- GitHub Actions source App id: `15368`.
- Forced stateless installation token: `ghs_` prefix, length 383, two dots, API authentication successful.
- Forced classic installation token: length 40, no dots, API authentication successful.
- The pinned `actions/create-github-app-token` revision exposes no stateless-format override input and passes its token
  opaquely. Qualification therefore separates direct-mint forced-format consumer proof from the ordinary pinned-Action
  production path.

GitHub's temporary per-request format override is documented at
`https://github.blog/changelog/2026-05-15-github-app-installation-tokens-per-request-override-header/`. Production must
retain no override and must never assume token prefix, length, dot count, regex shape, or storage width.

## Qualification evidence boundaries

Raw non-secret API responses and enforcement snapshots stay in the private operator checkpoint store. The repository
manifest may retain only sanitized ids, URLs, exact heads, timestamps, dispositions, capability outcomes, enforcement
summaries, and hashes. Credentials, installation tokens, private keys, secret values, and credential-bearing responses
never enter tracked artifacts.

The post-merge acceptance tail must establish the final provider capability table, enabled subset, source identities,
effective Codex guidance digest, trigger/event lifecycle behavior, receipt v1→v2 upgrade cases, passive watcher wake-
ups, finding closure sequences, token forms, and Actions-exclusive repair authority. Those observed contracts feed
`review-gate-enforcement-promotion` and the later `review-gate-github-adapter` productization work.

---
