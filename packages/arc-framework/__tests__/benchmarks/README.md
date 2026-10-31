# Manual benchmarks

These scripts run outside test tiers, CI jobs, and the published package. They need explicit local inputs and retain
their evidence at the operator-selected path.

## Git host trial

```sh
node --import tsx packages/arc-framework/__tests__/benchmarks/ref-host-properties.ts \
  github.com https://github.com/example/scratch.git /tmp/host-evidence /tmp/host-settings.json
```

Use disposable repositories with a seeded `main`. The kit writes synthetic records and removes only its own refs,
using exact leases. Provider forks remain available for inspection and require separate repository cleanup after
saving the evidence. Never point it at a project repository containing real ARC state.

The optional settings file contains local paths and provider setup commands, never token values:

```json
{
  "owner": { "profile": "/private/owner.json" },
  "member": { "profile": "/private/member.json" },
  "roleControl": ["python3", "/local/provider-setup.py"],
  "forkControl": ["python3", "/local/provider-setup.py"],
  "policy": {
    "remote": "https://github.com/example/policy-scratch.git",
    "owner": { "profile": "/private/member.json" }
  }
}
```

Profiles must have owner-only file permissions and contain `host`, `token`, and optionally `expectedLogin` or `login`.
Loopback profiles may also bind `port`. Bitbucket uses its API-token Git username automatically. `caFile` beside
`profile` selects a local certificate authority for a private appliance. HTTPS remains verified; HTTP is accepted only
on literal loopback hosts. Omitting a profile selects the existing `gh` or `glab` credential helper on those hosts, or
existing Git credentials elsewhere. No global account selection, credential configuration, or environment is changed.

The kit appends `writer` or `reader` to `roleControl`, and `fork` to `forkControl`. Each command runs without a shell
and returns one JSON object. Role controls change only the ordinary test identity's access to the source fixture,
verify its effective provider permissions, and return that evidence. Writer access is restored after the read-only
trial. Fork controls create a provider fork after native source state exists, wait for code import, and return:

```json
{
  "id": "provider-fork-id",
  "parent": "https://github.com/example/scratch.git",
  "remote": "https://github.com/test-user/scratch-fork.git"
}
```

The native trial independently checks copied `main` and the fork's advertised state refs. `forkState: "copied"`
selects the documented full-copy behavior on a provider such as Azure; the default requires no copied state refs.
Setup commands must keep credentials out of output and errors. Preserve their non-secret receipts with the trial.

The policy identity must be subject to `main` protection, including any administrator bypass rules. A separate policy
repository can supply a protection feature unavailable on the source's plan. The kit checks raw atomic refusal and
the public store's carried-code result, then verifies that state can still publish while protected code stays put.

An unsupported atomic receiver is recorded as a capability failure and keeps a nonzero exit status. Its native trial
also checks the multi-ref refusal before an explicitly recorded, single-ref registry bootstrap permits remaining
single-ref checks. Protocol failures do not suppress those remaining observations. Unreached checks remain unverified;
read `result.json`, `backend-results.json`, and captured diagnostics together. Packet traces are retained; HTTP header
tracing is disabled so credentials cannot enter the evidence through ambient curl tracing.
