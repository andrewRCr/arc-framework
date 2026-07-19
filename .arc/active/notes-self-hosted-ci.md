# Notes: self-hosted-ci

## Contents

- Effort and burden estimate (task-generation sizing reference)

---

## Effort and burden estimate

Runner registration itself is roughly a 30-minute operation; a reliable cutover is larger:

- VPS provisioning, hardening, packages, and two runner services — 1–2 hours
- Workflow label variable, fallback path, and focused verification — 3–5 hours
- Runbook, monitoring baseline, and decommission contract — 1–2 hours
- Canary review and one tuning pass — ~1 hour active over 7+ elapsed days and ≥20 heavy runs

Budget 6–10 hands-on hours (one to two focused working days) for the complete work unit. Normal maintenance should
average 15–30 minutes per month. Allow an occasional one-to-two-hour reboot, runner repair, or disposable VPS
rebuild; if that becomes common, the canary has failed and the design should fall back to hosted runners.
