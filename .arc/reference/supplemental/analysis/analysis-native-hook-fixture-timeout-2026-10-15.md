# Native hook fixture timeout investigation — 2026-10-15

A fixture deadline can kill Git while its pre-commit hook is still reading the candidate index. The commit helper
previously converted that process termination to exit 2, obscuring both the timeout and the resulting index loss.

## Original CI evidence

[Run 38786558416, attempt 1, E2E shard 2][original-job] failed the invalid-candidate case in
`markdown-commit-index.e2e.test.ts` at commit `db6984fb533eee70aef1b940ef02bead5ce0d90c`. The indexed Markdown
check correctly reported MD009 and took 29,849 ms. The fixture expected Git exit 1 but received 2; its commit
subprocess had a 30,000 ms timeout. The same head passed on attempt 2.

The original helper retained neither timeout nor signal fields, so those logs cannot prove the original termination
cause. Retrieve that exact job's logs through its job ID: the run-level `gh run view --job ... --log` retrieval
returned the later successful attempt during this investigation.

## Reproduction and process evidence

The unchanged focused Markdown test and one busy Python worker were pinned to the same allowed Linux CPU. This is
controlled local CPU contention, rather than a reproduction of the complete GitHub runner environment.

- At the original 30-second commit limit, both cases returned exit 2. Their staged checks reported different
  committed source paths missing after about 28 seconds; both cases finished in about 33.5 seconds.
- Repeating that experiment with the helper preserving native process errors produced explicit
  `Command timed out after 30000 milliseconds: git commit ... -a` errors in both cases, alongside the same
  missing-source symptom. The combined test duration was 67.18 seconds.
- With a 60-second commit limit and a 90-second outer case limit, both unchanged content assertions passed under
  the same contention. The combined test duration was 110.67 seconds, with a 113.10-second focused run.

A separate real-Git probe isolated the index lifetime. A pre-commit hook sampled the index named by
`GIT_INDEX_FILE`, while the parent commit had a one-second timeout:

| Event                          | Time since hook start | Candidate index present |
| ------------------------------ | --------------------: | ----------------------- |
| Hook starts                    |                  2 ms | yes                     |
| Git terminates; hook continues |                993 ms | no                      |
| Hook finishes                  |              1,802 ms | no                      |

The parent result had `timedOut: true`, no exit code, and `signal: SIGTERM`. The hook's parent changed from Git
to the init process while the hook continued. Git had removed its temporary `.git/index.lock`; later reads by that
hook therefore no longer described the candidate that existed when it started.

This establishes one mechanism for the related missing-source symptom under contention. It does not recover the
unrecorded termination fields from either historical CI failure or establish an independent blob-reader defect.

## Correction and verification

`commitThroughManager` preserves the native process error, including timeout, signal, duration, and captured hook
output, whenever Git times out or produces no exit status. Completed Git exits keep their numeric status. Its default
limit remains 30 seconds; the heavy Markdown fixture supplies 60 seconds and leaves the outer case 90 seconds.

Real-Git integration tests first failed against the former helper, then passed with the correction. They distinguish
a timeout from ordinary exit 1, retain a native SIGTERM as a signal, and verify a successful commit after repairing
the timed-out fixture. The Markdown assertions still require invalid candidate bytes to be refused without moving
HEAD, and valid candidate bytes to reach both HEAD and the repository index.

---

[original-job]: https://github.com/andrewRCr/arc-framework/actions/runs/38786558416/job/116600646694
