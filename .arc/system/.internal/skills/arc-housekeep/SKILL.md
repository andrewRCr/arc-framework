---
name: arc-housekeep
description: Drain the user inbox — classify and route each entry to its authoritative home.
disable-model-invocation: false
---

# ARC Housekeep

Apply `.arc/system/workflows/arc/supplemental/drain-inbox.md`. The workflow resolves the base-branch
write-context precondition, then classifies each `USER-INBOX` entry by character and home and routes
it to its authoritative home in one batched pass.
