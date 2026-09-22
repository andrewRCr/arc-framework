# Strategy: Self-Hosting Delivery Topology Recovery

**Purpose:** Diagnose and recover the bootstrap-only ancestry divergence that can occur when this repository changes
delivery machinery while that machinery is delivering its own bound stack.

**Scope:** Project-internal self-hosting recovery. This strategy does not define a supported delivery shape, relax
provider-adoption exactness, or add a compatibility path for other ARC projects.

---

## Applicability Boundary

Use this strategy only when all of these facts hold:

- the ARC framework repository is delivering a work unit that changes the delivery implementation executing that
  same delivery;
- an approved correction left a separately verified work-unit tree on the terminal branch;
- member rematerialization or refresh produced a new highest non-terminal member; and
- the retained delivery continuation refuses terminal ancestry adoption as `top-moved` because the terminal branch
  is neither the exact bound top nor its exact two-parent adoption.

An ordinary terminal `content-conflict` follows its disclosed hand-merge route instead. Uncertain or missing
coordinates, an unverified work-unit tree, a moved public terminal, or a stale retained operation stop this recipe;
reobserve through the delivery continuation. Do not reconstruct authority from branch names or repair Delivery State
by hand.

## Diagnosis

The bootstrap failure is a history-shape divergence, not evidence that either side's content should win. Correction
authoring can append to the recorded terminal while a self-hosted refresh rebuilds the members beneath it. The
corrected terminal then contains the intended work-unit tree but does not descend from the refreshed highest member.
The ancestry-adoption guard (`adoptGitDeliveryChain`) correctly rejects that moved ref: its moved-top admission
requires the bound public terminal as first parent, the refreshed highest member as second parent, and the tree bound
by the retained operation. The separate terminal-absorption path admits an exact parent pair with any readable tree,
so the manual `<verified-tree>` proof below remains the authoritative content check for this recovery.

Retain the exact delivery action and operation before diagnosing. Bind four values from its canonical evidence:

- `<corrected-top>` — the current clean terminal branch head carrying the verified work-unit tree;
- `<public-terminal>` — the exact terminal head the retained operation expects as first parent;
- `<refreshed-predecessor>` — the exact refreshed highest-member head it expects as second parent; and
- `<verified-tree>` — the terminal tree already covered by the work-unit verification evidence.

Confirm the condition without mutation:

```bash
git status --short
git rev-parse <corrected-top>^{commit} <public-terminal>^{commit} <refreshed-predecessor>^{commit}
git rev-parse <corrected-top>^{tree}
git merge-base --is-ancestor <public-terminal> <corrected-top>
git merge-base --is-ancestor <refreshed-predecessor> <corrected-top>
git rev-list --parents -n 1 <corrected-top>
```

The worktree must be clean; the corrected top must append to the public terminal; its tree must equal
`<verified-tree>`; and the refreshed predecessor must **not** be its ancestor. If the current head is already the exact
two-parent adoption, rerun the retained continuation instead of composing another commit. Any other result is a
different failure.

## Anchored Recovery

Preserve the corrected head before moving its branch. Choose a new local-only safety branch; creation must fail rather
than overwrite an existing ref.

```bash
git branch recovery/<work-unit>-delivery-topology <corrected-top>
```

Create one commit whose tree is the verified result and whose ordered parents are the two coordinates the adoption
guard requires:

```bash
git commit-tree <verified-tree> \
  -p <public-terminal> \
  -p <refreshed-predecessor> \
  -m "Recover self-hosting delivery ancestry"
```

The command prints `<repaired-head>`. Prove its complete shape before moving the terminal ref:

```bash
git rev-parse <repaired-head>^{tree}
git rev-list --parents -n 1 <repaired-head>
git diff --quiet recovery/<work-unit>-delivery-topology <repaired-head> --
```

Require the tree to equal `<verified-tree>`, the parent line to equal
`<repaired-head> <public-terminal> <refreshed-predecessor>`, and the diff to be empty. Then move only the local
terminal branch under an exact old-head lease:

```bash
git update-ref refs/heads/<work-unit-branch> <repaired-head> <corrected-top>
git status --short
```

The checked-out tree stays unchanged because the replacement commit carries the same tree. A lease failure or dirty
worktree stops recovery intact. Do not push the repaired ref, rewrite a member ref, or edit delivery records by hand.
Re-enter the retained delivery continuation and let its existing exact guards adopt, publish, and settle the result.

Keep the safety branch through settlement. Because the corrected commit is deliberately not a parent of the repaired
head, its later removal is a separate explicit cleanup decision rather than part of this recovery.

## Design Boundary

This recipe composes existing Git and delivery invariants around a development bootstrap condition. Automating it, or
preventing the condition by requiring the terminal authoring locus to descend from the current highest member, would
change correction-entry semantics and needs delivery-state design plus executable coverage. Do not turn this recovery
guide into shipped behavior as an incidental fix.
