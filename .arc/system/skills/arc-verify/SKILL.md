---
name: arc-verify
description: Run ARC installation health checks — config validation, file structure, reference integrity, hook status, and session state. Use when asked to verify or check the ARC installation.
disable-model-invocation: false
---

# ARC Verify

1. Run the verification script.

   - Execute `.arc/system/scripts/verify-integrity.sh` from the repository root.
   - Capture the full output and exit code.

2. Interpret results using the workflow guidance.

   - Read `.arc/system/workflows/arc/supplemental/verify-arc-integrity.md` for severity
     definitions, remediation hints, and agent role guidance.
   - **Exit 0 (all clear):** Report clean status briefly.
   - **Exit 1 (warnings):** Summarize warnings with context — most are advisory.
   - **Exit 2 (errors):** For each error, offer a targeted fix. Group related errors
     (e.g., multiple missing files). Ask before making changes.
