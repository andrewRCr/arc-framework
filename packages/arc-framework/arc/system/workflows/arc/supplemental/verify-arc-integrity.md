# Workflow: Verify ARC Integrity

**Audience:** Agent-executed — invoked via the `arc-verify` skill or directly by the agent when
verifying installation health.

## Purpose

Run mechanical health checks against an ARC installation and interpret results. The verification
script performs deterministic checks; this workflow defines what the checks mean, how to interpret
severities, and what remediation to offer.

## When to Use

- **Post-setup:** After `arc init` or `arc-setup` to confirm the installation is complete
- **Standalone health check:** When something seems wrong — broken hooks, missing files, config
  drift
- **Post-modification gate:** After editing `arc-config.yml`, `arc-methods.md`, or structural
  files — verify the change didn't break references or cross-field dependencies

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

### Session State

Checks that WORK-STATUS.md exists, the task list path it references is valid, and the next task
reference can be found in the task list.

**Severity:**

- **ERROR** — WORK-STATUS.md missing or task list path invalid.
- **WARN** — next task reference not found in task list (may be stale).
- **INFO** — no active task list (`[none]` in WORK-STATUS.md).

**Remediation:** Update WORK-STATUS.md to reflect current state. If the task list was moved or
renamed, update the path.

### Methods and Extensions

Structural check: verifies that `arc-methods.md` has all expected method sections (each with
`.override` and `.default` subsections) and `arc-extensions.md` has all expected extension
sections.

**Severity:**

- **ERROR** — expected section missing.

**Remediation:** Restore the missing section. If upgrading from an older ARC version, the section
may need to be added manually or via `arc update`.

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

[scripts-readme]: ../../../system/scripts/README.md
