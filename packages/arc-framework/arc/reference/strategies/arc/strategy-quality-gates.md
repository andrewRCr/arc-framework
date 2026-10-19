# Strategy: Quality Gates

Operator guidance for declaring project checks and choosing their deadlines. The check declaration lives in
`.arc/system/arc-checks.yml`; the verb's help and emitted remedies cover selection, reuse, and execution.

## Place checks by deadline

Assign each check to the earliest event before which its failure must be resolved. Keep the commit gate fast enough
for regular commits; put broader verification at push and the complete project suite at the merge quality gate.
The project decides which checks meet each deadline from its actual dependencies and measured costs.

Place a related-tests check at the push gate, with the merge quality gate's whole-suite run catching what the import
graph misses, unless changes often reach tests through inputs no import graph shows; then a whole-suite check holds
the push gate, and the related-tests check has no gate and is requested by id at the increment boundary.

## Declare the inputs the check depends on

Include the source, configuration, dependency, and runtime inputs whose changes can alter the result. Inputs that
are too broad spend time on unrelated changes; inputs that omit a dependency can reuse a result that no longer covers
what the check examines. Choose scope from the check's real dependencies rather than its command's name.

Choose the commit-fix behavior to match the project's staging practice: automatic restaging or a failed hook that
leaves rewrites for the person to stage. Other verification requests run fix-capable checks as checks and report
rewrites as failures.

## Check state where it is edited

Git and index enumeration omit ignored projected state. Disk globs can still read those files: a per-clone
`.git/info/exclude` entry affects Git, but a tool's glob or ignore-file reader may never consult it. A disk glob can
therefore include protected files or files holding conflict markers that the editable selection excludes.

Give each Markdown tool exactly the paths it should read: Git's list for repository content, and the editable
selection for projected state. Disable the tool's own glob expansion and ignore-file filtering for supplied operands;
use its literal-path syntax so brackets, spaces, and other filename characters cannot widen the request. Verify the
recipe by running the real tool over admitted and excluded fixtures, including ignored files.

Declare read-only state checks with `mode: selection` and omit `gate`. For example, the shipped link validator accepts
explicit filenames and checks a record's links to tracked files for existence:

```yaml
checks:
  lint:state:links:
    command: [bash, .arc/system/.internal/scripts/validate-links.sh]
    mode: selection
    inputs: ["**/*.md"]
```

`arc check increment` and `arc check segment` run selection checks as feedback over files changed since the last save.
A named run such as `arc check run lint:state:links` checks the whole editable selection; `--changed` limits it to
changed files. These checks run without cached passes, never certify a Git-backed gate, and do not decide whether
state may be saved. Record-write validation owns state validity. An unavailable selection reports its reason; repair
the selection and retry the same request.

Keep fixing on demand over the authorized lint corpus, with write-authority and configuration validation before any
rewrite. A selection check is a read, so automatic fixer recipes do not belong in it.

## Handle failures at the caller's boundary

Follow [DEV-RULES.ARC][dev-rules-arc] § Quality gate failure. The result distinguishes failed enforcement from
feedback; a skipped check is never a pass. Workflow checks report their result before their existing approval gate.

---

[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
