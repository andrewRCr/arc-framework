# Security Policy

## Supported Versions

ARC is pre-1.0. Security fixes land on `main` and ship in the next published release of `@arc-framework/cli`;
earlier releases are not patched.

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub's [private vulnerability reporting][report], not in a public issue,
pull request, or discussion. Include the affected version or commit, steps to reproduce, and the impact you observed.

ARC has a single maintainer, so responses are best-effort. Reports are acknowledged once read, and fixes are
coordinated with the reporter before any public disclosure.

## Scope

In scope: the `@arc-framework/cli` package, the methodology files it installs, and this repository's GitHub Actions
workflows. Vulnerabilities in third-party dependencies belong with their upstream projects; report them here only
when ARC's use of the dependency is what makes them exploitable.

---

[report]: https://github.com/andrewRCr/arc-framework/security/advisories/new
