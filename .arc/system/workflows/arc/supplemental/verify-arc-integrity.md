---
purpose: Run mechanical health checks against an ARC installation and interpret the results.
audience: agent
---

# Workflow: Verify ARC Integrity

The verification script performs deterministic checks; this workflow defines what the checks mean,
how to interpret severities, and what remediation to offer.

## When to Use

- **Post-setup:** After `arc init` or `arc-setup` to confirm the installation is complete
- **Standalone health check:** When something seems wrong — broken hooks, missing files, config
  drift
- **Post-modification gate:** After editing `arc-config.yml`, files under `system/methods/` or
  `system/extensions/`, or structural files — verify the change didn't break references or
  cross-field dependencies

## Running the Script

From repository root:

```bash
.arc/system/scripts/verify-integrity.sh
```

The script produces structured output — one line per check with a severity prefix (`PASS`, `WARN`,
`ERROR`, `INFO`). Exit codes: `0` (all clear), `1` (warnings only), `2` (errors present).

## Check Categories

### Config Validation

Delegates to `validate-config.sh`. Catches:

- **Invalid enum values** — typos in setting values (e.g., `convential` instead of `conventional`)
- **Cross-field dependency violations** — `commit.format: custom` without a `commit.custom_pattern`,
  or a pattern set when not in `custom` mode
- **Unknown keys** — possible typos in key names

**Remediation:** Open `arc-config.yml` and fix the flagged values. Valid options are documented as
inline comments in the config file.

### File Structure

Verifies that expected core files exist. The expected set is static (every ARC installation needs
these) plus config-conditional files (e.g., ROADMAP.md when `pm.mode: arc-in-git`).

**Severity:**

- **ERROR** — core file missing. The installation is incomplete or a file was deleted.
- **PASS** — file exists at expected path.

**Remediation:** Re-run `arc init` or `arc update` to restore missing files. If a file was
intentionally removed, the error is expected and can be noted.

### Hook Status

Checks that hook files exist, are executable, and that `core.hooksPath` points to the hooks
directory. Only checks hooks that are enabled in config.

**Severity:**

- **ERROR** — enabled hook file missing.
- **WARN** — hook exists but not executable, or `core.hooksPath` misconfigured.
- **INFO** — hook disabled in config (not checked).

**Remediation:**

```bash
# Fix permissions
chmod +x .arc/system/githooks/commit-msg .arc/system/githooks/pre-commit

# Fix hooks path
git config core.hooksPath .arc/system/githooks
```

### Strategy Index Consistency

Bidirectional check: every entry in `STRATEGY-INDEX.md` points to an existing file, and every
strategy file in the directory is indexed.

**Severity:**

- **ERROR** — indexed entry has no corresponding file.
- **WARN** — file exists but is not indexed.

**Remediation:** Update `STRATEGY-INDEX.md` to match the actual strategy files, or create/remove
strategy files as needed.

### Reference Integrity

Checks reference-style markdown links (`[name]: path`) in key documents. Verifies that link
targets resolve to existing files.

**Severity:**

- **ERROR** — broken link (target file does not exist).

**Remediation:** Fix the link path or create the missing target file. Common causes: file renamed
or moved without updating references.

### Methods and Extensions

Structural sanity check: verifies that `system/methods/` and `system/extensions/` exist and that
each file within opens with a YAML frontmatter block containing the required keys (`name`,
`description`, plus `override-active` for methods / `active` for extensions). `README.md` is
excluded. Deep schema validation — name-matches-basename, type correctness, related-array
shape — runs in the pre-commit frontmatter hook (CHECK 11); this check is a post-hoc
diagnostic, not a replacement.

**Severity:**

- **ERROR** — methods or extensions directory missing, a file lacks the opening `---` frontmatter
  delimiter, the frontmatter block is not closed within the first 20 lines, or a required key is
  absent.
- **WARN** — directory exists but contains no method/extension files.

**Remediation:** Restore the missing directory, file, or frontmatter key. If upgrading from an
older ARC version, re-run `arc update` to pull in the per-file structure.

### Manifest

Informational check for `.arc-manifest.json`. When present (post-CLI installations), future
versions will validate manifest entries against files on disk.

**Severity:**

- **INFO** — manifest present or absent (both are valid states).

## Agent Role

When invoked via the `arc-verify` skill:

1. Run `verify-integrity.sh` and capture output
2. **All clear (exit 0):** Report clean status
3. **Warnings (exit 1):** Report warnings with brief context — most are advisory and don't
   require immediate action
4. **Errors (exit 2):** For each error, offer a targeted fix based on the remediation guidance
   above. Group related errors (e.g., multiple missing files → suggest `arc update`). Ask before
   making changes.

---

_Verification scripts live in `.arc/system/scripts/`. See [scripts/README.md][scripts-readme] for
the full script inventory._

---

[scripts-readme]: ../../../scripts/README.md
