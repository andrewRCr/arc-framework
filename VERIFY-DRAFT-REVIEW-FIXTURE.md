# Draft-Review Verification Fixture

This file exists only to give a scratch pull request a reviewable diff. The PR it rides in verifies
whether hosted review providers respond to review requests while the pull request is in draft state.

The PR is closed without merging once the behavior is observed, and this file never lands on main.

```ts
export function fixtureProbe(input: string): string {
  return input.trim().toLowerCase();
}
```
