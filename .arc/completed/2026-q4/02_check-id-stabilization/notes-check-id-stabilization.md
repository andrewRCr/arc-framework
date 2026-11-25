# Notes: Check ID Stabilization

## Prior art and naming rationale

Official tooling documentation supports stable identity independently of display text or source order:

- [pre-commit][pre-commit] separates a hook's `id`, used for configuration and selection, from its displayed
  `name`. This is the closest precedent for keeping identity stable when a descriptive heading changes.
- [ESLint][eslint-rules] uses rule identifiers as configuration keys. [Plugin rule IDs][eslint-plugins] add a
  provider namespace where multiple providers share the naming surface; these local hook blocks need none.
- [ShellCheck][shellcheck-codes] gives numeric diagnostic codes defined meanings. Numbers can be stable IDs;
  source position is the cause of the current drift, rather than numeric spelling itself.

`CHECK[slug]` is a local convention, not an industry-standard Bash marker. Descriptive names provide meaning directly,
and brackets delimit the ID from its human description. The cited tools do not prescribe source-block extraction.
Keep IDs flat within the hook; navigation headings can organize prose independently of identity.

## Alternatives considered

- Positional ordinals, whether renumbered or left with gaps, retain the source-order coupling.
- Stable numeric codes are viable but require a code-to-meaning lookup without adding value for these comment labels.
- Another semantic spelling, such as `CHECK: frontmatter-schema`, would satisfy the identity goal. Brackets make the
  marker distinct and searchable; no external compatibility contract requires another spelling.
- A heal-on-touch migration would prolong mixed conventions and known wrong references across a small, enumerable
  surface. A complete migration gives the next check addition one convention to follow.

---

[pre-commit]: https://pre-commit.com/#creating-new-hooks
[eslint-rules]: https://eslint.org/docs/latest/use/configure/rules
[eslint-plugins]: https://eslint.org/docs/latest/extend/plugins
[shellcheck-codes]: https://www.shellcheck.net/wiki/index.html
