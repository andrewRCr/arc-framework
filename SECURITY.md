# Security Policy

## Supported Versions

ARC is pre-1.0. Security fixes land on `main` and ship in the next published release of `@arc-framework/cli`;
earlier releases are not patched.

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub's [private vulnerability reporting][report], not in a public issue,
pull request, or discussion. Include the affected version or commit, steps to reproduce, and the impact you observed.

ARC has a single maintainer, so responses are best-effort. Reports are acknowledged once read, and fixes are
coordinated with the reporter before any public disclosure.

## Dependency dispositions

Read the [dependency exposure assessment][dependency-assessment] before opening a repeat dependency finding. Match
its advisory ID, affected versions, dependency path, and usage conditions against the current evidence. An unchanged
assessed finding keeps its recorded disposition; new evidence, including a compatible fix, reopens triage.

Accepted remaining risk stays visible in audit output. The assessment neither suppresses scanner findings nor
satisfies required checks.

## Scope

In scope: the `@arc-framework/cli` package, the methodology files it installs, and this repository's GitHub Actions
workflows. Vulnerabilities in third-party dependencies belong with their upstream projects; report them here only
when ARC's use of the dependency is what makes them exploitable.

---

[report]: https://github.com/andrewRCr/arc-framework/security/advisories/new
[dependency-assessment]: .arc/reference/supplemental/analysis/analysis-dependency-audit-2026-10-15.md
