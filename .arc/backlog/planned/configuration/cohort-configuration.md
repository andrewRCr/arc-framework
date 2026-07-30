# Cohort: `configuration`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Parent:** [none]

**Purpose:** Group ARC's configuration work around three distinct concerns: where configuration lives, how
configuration composes with methods and extensions, and how configuration-schema changes migrate over time.
The members share a domain and must preserve one coherent configuration model, but each owns a separate mechanism
and can plan and ship independently.

---

## Coordination

There are no hard dependency edges within the cohort. Coordinate only where the mechanisms meet:

- Configuration storage owns project- and user-scope loci, identity bootstrap, and the file/schema boundary.
  Customization architecture consumes that shape when it settles user-scoped activation; it does not redefine
  storage.
- Customization architecture owns the config-versus-method-versus-extension boundary. A migration triggered by
  one of its schema changes belongs to the migration registry rather than to the customization mechanism itself.
- The migration registry owns version-gated evolution during `arc update`. It consumes concrete schema changes
  from the other members without becoming the authority for those schemas.

If members run concurrently, sequence edits to shared config schemas and update machinery rather than duplicating
the same migration or naming decision. Otherwise, treat the work units as independent.

---
