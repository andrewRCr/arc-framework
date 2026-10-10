# Draft: Seam Status and Roadmap

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09); stage 2 of the storage program.
- **Purpose:** Render ROADMAP, `STATUS.USER`, `arc view`, and the status surfaces from the store's typed listings, so
  ROADMAP stops being a stored file at the flip and every derived view reads parsed fields rather than scraped Markdown.

---

## Continuity

- **Readiness:** maturing. The cut carried this member's section of `storage-seam`'s draft over unchanged, from a draft
  the readiness check found formalization-ready for the cut (2026-10-09); what stays open is this member's own detail
  design.
- **Next:** draft-design, after `seam-locus`, whose in-flight model it renders (`cohort-storage-seam.md`
  § Coordination): re-verify its consumer-map rows against the current code.

**Reading this draft.** `cohort-storage-seam.md` holds the seam's coordination, its scope boundary, and how the
register's keys are cited. A `§ Shared decisions` item lives in its owner's draft: items 1–8 and 11 in
`draft-seam-record-kinds.md`, item 9 in `draft-seam-locus.md`, and items 10 and 12 in `draft-seam-lifecycle.md`.
`§ Record kinds`, `§ Lifecycle`, `§ Decomposition`, `§ Delivery and review records`, `§ Locus`, and
`§ Status and roadmap` name the member sections of `draft-seam-record-kinds.md`, `draft-seam-lifecycle.md`,
`draft-seam-decomposition.md`, `draft-seam-delivery-review.md`, `draft-seam-locus.md`, and
`draft-seam-status-roadmap.md`. `D` and `A` numbers are `spec-storage-contract.md`'s decisions and amendments.

## Members

### Status and roadmap

- **Rows and keys.** ROADMAP (18): every path that writes, renders, or checks the stored file stops on the capability,
  and rendering reads the store; `roadmap-tooling` keeps the render standard. `STATUS.USER` rendered on demand, any
  cache machine-local and outside the import (53). The archive listing as a derived view status builds, since nothing
  reads an archive sequence today (06). The register's `arc view` row: it reads through the contract, with paths from
  the layout resolver, and a completed work unit gets its path.
- **Derived views read typed listings.** The contract's `list` returns each record's parsed fields (D1), so renderers —
  `arc view`, the status surfaces, a later status HUD — consume typed fields, never scraped Markdown.
- **The composition also decides.** `resolveProjectReadinessComposition` (`lib/status/project-view.ts`) supplies the
  lifecycle facts that start, rename, lifecycle transformations, abandon, and the integration checkpoint dispatch and
  guard on (`composed-lifecycle-index.ts`, lifecycle's), so those reads go through the store while rendering may read
  the projection. Status and lifecycle coordinate on the file.
- **Purpose and the live view.** `inbound-routing-method` (its D11) adds a derived purpose — the first sentence of the
  `Design` artifact's `**Purpose:**`, a `wu.prose` read — to `arc status <slug>` and the `arc status --project --json`
  facts rows, beside the meta's owner, per-slug state and position, and a horizon advisory; and its design has
  `arc view <kind> --for <slug>` read a started work unit from its registered checkout or its selected ref, refusing
  `--path` and `--editor` without a checkout. Its task list settles four details the reroute keeps, all provisional on
  that work unit landing as specified:
    - **The `design` selector.** `arc view design` picks from the meta's `Design` list — the first listed artifact with
      a `**Purpose:**` field, otherwise the first that exists — rather than naming a stored kind, so it survives the
      flip by mapping each entry to a draft, spec, or companion reference (`work-item/companion` for a layered
      design's halves). `VIEW_KINDS` (`lib/view/types.ts`) therefore derives as the registry's kinds plus that
      selector, never the kinds alone.
    - **The purpose read** applies the same selection and reads an empty field or the template's `—` placeholder as
      no purpose, so it reroutes through the draft, spec, and companion parsers' Purpose field and reads every listed
      artifact's parsed value.
    - **One composition call site.** `arc status <slug>` and `arc view --for` share one local-composition helper
      beside `resolveComposedLifecycleIndex` in `composed-lifecycle-index.ts`, so rerouting the composition through
      the store moves one call for both, and status and lifecycle coordinate on that file as well.
    - **The pre-flip arm is one module** — the started target's location, its `<ref>:<path>` reads, the meta read
      behind the `cohort` view, the unavailable report for an indeterminate slug, and the `--path` / `--editor`
      refusal — deleted whole at the flip with its help text, since the projection gives every artifact a file;
      `arc view`'s rendering of a started work unit reroutes through the store, unchanged in content.
- **`arc view`'s default target** comes from the checkout's marker — a work unit's files, or an Errand's description
  when the claim is an Errand — not from which files exist. From the flip, `arc view <slug>` shows a closed Errand's
  description from its quarter's archive ref, with the record's state.
- **One identity.** `arc status`'s slug query and ROADMAP rendering read only `arc.identity`
  (`readConfiguredIdentity`), where the contract resolves identity as user and Errand commands do (`resolveIdentity`);
  the difference ends when the last of them is rerouted.

---
