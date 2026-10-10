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

## Handle failures at the caller's boundary

Follow [DEV-RULES.ARC][dev-rules-arc] § Quality gate failure. The result distinguishes failed enforcement from
feedback; a skipped check is never a pass. Workflow checks report their result before their existing approval gate.

---

[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
