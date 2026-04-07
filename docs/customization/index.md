# Customization

ARC ships strong defaults for every convention. Customization is how you adapt those conventions to
your team's workflow while keeping the [methodology](../methodology/index.md) intact.

Three mechanisms, each for a different kind of change:

- **[Configuration](configuration.md)** — values in `arc-config.yml` that control behavior: toggles,
  mode selections, enforcement levels.
- **[Methods & Extensions](methods.md)** — replace *how* ARC does something (method overrides) or
  inject additional steps at workflow boundaries (extension points).
- **[Agent Hooks](hooks.md)** — platform-level lifecycle hooks that complement ARC's document-based
  workflows with deterministic automation.

The principles stay fixed; the implementation details flex. See
[Principles vs. Conventions](../methodology/rationale.md#principles-vs-conventions) for where the
line falls.
