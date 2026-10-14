# Notes: pull-request-surface-policy

**Local (2026-10-14).**

- **One composer.** `arc delivery publish` is the only CLI composer of a title or body. Errand and work-unit PRs are
  agent-composed from prose (`gh pr create` with no `--title` or `--body` in either workflow). No CI or hook checks a
  pull request's title or body.
- **No host template.** The repository has no `.github` PR template.
- **Merge settings.** `allow_squash_merge: false`, `merge_commit_title: MERGE_MESSAGE`,
  `merge_commit_message: PR_TITLE`. The commit-msg hook's merge exemption covers local merges only; the host's merge
  commit runs no local hook.
- **Review-record history.** A composed `## Review` record — local and hosted pass counts, and
  `Triage: @handle — addressed · deferred · unresolved` — shipped 2026-08-15 (`745e8e580`). It was cut to a
  carrier-only marker the next day (`42df72ccc`) after a precedent review found no convention for recording review
  in a pull-request body. The rationale is `integration-boundary-accuracy`'s G3–G7. G7's escape hatch, richer
  reporting through a `pre-merge` extension, retired with `retire-extension-points` (PR #981).
- **`Decisions` history.** It reached the Errand body as `Decided: X over Y — because Z` (ADR-037, 2026-10-09) and
  became a prose `## Decisions` section the next day (`c986146d9`).

**External (2026-10-14).** Five load-bearing claims were checked directly:

- commitlint's `config-conventional` sets `subject-case` to never sentence, start, pascal, or upper case.
- Kubernetes requires disclosure in the PR description and prohibits `assisted-by` and `co-developed` trailers, per the
  April 2026 dev-list announcement and the 2026-06-26 blog post.
- The Y-statement form is Zimmermann's, evolved from Fairbanks' architecture haiku. Cite the wording from
  `ozimmer.ch`; the check confirmed it only through secondary sources.
- `refs/pull/<n>/head` persists after branch deletion, as observed (B3).
- GitHub's stacked pull requests are generally available on all github.com plans, per the 2026-10-06 changelog;
  Enterprise Server support is announced for a later release, and stack auto-merge is still rolling out (T2).

The rest come from one unverified research pass (confidence medium):

- **Titles.**
    - No prevalence study of PR-title formats exists.
    - PR-title linters (`amannn/action-semantic-pull-request`) assume squash.
    - release-drafter and title-prefix labelers read titles under any merge strategy; release-please and
      semantic-release read commits.
    - Copilot's coding agent titles in prose.
    - Google's guidance asks for a short imperative first line and is compatible with a type prefix.
    - The ICSE 2025 Conventional Commits study reports type choice as the top pain, which sharpens the ambiguity of
      one type over a multi-commit PR.
- **Disclosure.**
    - `Assisted-by:` leads among trailers. The Linux kernel uses `Assisted-by: AGENT:MODEL [TOOLS]`, Fedora uses
      `Assisted-by:`, and OpenStack uses `Assisted-By`/`Generated-By`. `Co-authored-by` for a model is disfavored.
    - Kubernetes requires disclosure in the PR description and forbids AI trailers.
    - Ghostty asks for the tool and the extent of AI use.
    - LLVM (2026-01) requires a human in the loop and labelling substantial generated content.
    - Every policy puts accountability on the submitter. None asks for a per-pull-request triage statement, and none
      covers AI review disclosure.
- **Body.**
    - Pirouzkhah et al. 2026 (about 80K pull requests) find that stating the desired feedback type best predicts
      acceptance.
    - Xiao et al. (FSE 2024) find generated descriptions associate with faster review, with a caution against
      including every generated section.
    - The evidence on length is conflicting.
    - Kubernetes headings: "What this PR does / why we need it", "Special notes for your reviewer".
    - Phabricator: "Summary" and "Test Plan".
    - Maintainers object to verbose AI-written descriptions (Biopython, Godot, Autoware's policy).
