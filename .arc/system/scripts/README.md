# Scripts

Deterministic tooling for ARC installations — mechanical checks, validation, and verification.

Scripts in this directory are distinct from [git hooks](../githooks/README.md): hooks run
automatically at git lifecycle events; scripts are invoked explicitly by users, agents, or other
scripts.

## Shared Library

- **`arc-lib.sh`** — Shell functions shared across scripts and hooks. Source it, don't execute it.
  Provides `arc_config_get` (config reader) and `arc_config_keys` (key lister). Both hooks and
  scripts source this library to avoid duplication.

## Validation Scripts

- **`validate-config.sh`** — Validate `arc-config.yml` settings. Checks enum values for all keys,
  cross-field dependencies (e.g., `custom` format requires a pattern), and unknown key detection
  (typo protection). Called by `verify-integrity.sh` and usable standalone.

- **`verify-integrity.sh`** — Orchestrator that runs all mechanical health checks: config
  validation, file structure, reference integrity, hook status, and session state consistency.
  Invoked via the `arc-verify` skill.

## Running

All scripts expect to be run from the **repository root**:

```bash
# Validate config only
.arc/system/scripts/validate-config.sh

# Full integrity check
.arc/system/scripts/verify-integrity.sh
```

## Output Format

Scripts produce structured output — one line per check with a severity prefix:

```text
PASS  description
WARN  description
ERROR description
```

Exit codes: `0` = all pass, `1` = warnings only, `2` = errors present.
