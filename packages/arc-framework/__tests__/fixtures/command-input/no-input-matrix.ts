/** Exact command-level coverage matrix for interaction-capable CLI source sites. */

export interface NoInputMatrixCase {
  readonly commandPath: string;
  readonly args: readonly string[];
  readonly fixture?: "bare" | "arc-project";
  readonly setup?: "provisional-stub" | "planned-stub";
  readonly configuration?: "full-protection";
  readonly expected: { readonly exitCode: number; readonly outputIncludes?: string };
  readonly stdin?: string;
  readonly preservesWorktree?: true;
}

/**
 * Each case runs in a fresh piped-stdio repository with CI and `--no-input` set.
 * Repository inventory tests exact-match these command paths to live interaction sites.
 */
export const NO_INPUT_MATRIX: readonly NoInputMatrixCase[] = Object.freeze([
  { commandPath: "abandon", args: ["abandon", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "activate", args: ["activate", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "archive", args: ["archive", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "check commit-msg", args: ["check", "commit-msg", "-", "--json"], stdin: "feat(check): validate stdin\n\nContext: standalone (maintenance)\n", fixture: "arc-project", expected: { exitCode: 0, outputIncludes: "\"verdict\":\"pass\"" } },
  { commandPath: "deactivate", args: ["deactivate", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "decompose", args: ["decompose", "origin", "--preflight"], fixture: "arc-project", expected: { exitCode: 1 } },
  { commandPath: "delivery compose", args: ["delivery", "compose", "--landed-prefix", "not-json", "--json"], fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery eligibility close", args: ["delivery", "eligibility", "close", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery eligibility prepare", args: ["delivery", "eligibility", "prepare", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery entry inspect", args: ["delivery", "entry", "inspect", "--input", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery land apply", args: ["delivery", "land", "apply", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery land prepare", args: ["delivery", "land", "prepare", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery materialize", args: ["delivery", "materialize", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery plan abandon", args: ["delivery", "plan", "abandon", "--json"], expected: { exitCode: 1 } },
  { commandPath: "delivery plan from-branch", args: ["delivery", "plan", "from-branch", "--json"], expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery plan from-tasks", args: ["delivery", "plan", "from-tasks", "--json"], expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery position", args: ["delivery", "position", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery publish", args: ["delivery", "publish", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery reconcile", args: ["delivery", "reconcile", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery rematerialize", args: ["delivery", "rematerialize", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery rewrite", args: ["delivery", "rewrite", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery terminal attach", args: ["delivery", "terminal", "attach", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery terminal prepare", args: ["delivery", "terminal", "prepare", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "delivery teardown", args: ["delivery", "teardown", "-", "--json"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "invalid-command-input" } },
  { commandPath: "demote", args: ["demote", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "errand open", args: ["errand", "open", "matrix", "--inbox-title-file", "-"], stdin: "Matrix title\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "Missing USER-INBOX entry 'Matrix title'" } },
  { commandPath: "finalize", args: ["finalize", "invalid"], expected: { exitCode: 1 } },
  { commandPath: "hook-remedy-roadmap-conflict", args: ["hook-remedy-roadmap-conflict"], fixture: "bare", expected: { exitCode: 0 } },
  { commandPath: "init", args: ["init", "--name", "matrix", "--identity", "matrix"], fixture: "bare", expected: { exitCode: 0, outputIncludes: "Installation complete" } },
  { commandPath: "integrate", args: ["integrate", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "join", args: ["join", "--identity", "matrix"], fixture: "arc-project", expected: { exitCode: 0, outputIncludes: "Workspace setup complete" } },
  { commandPath: "materialize", args: ["materialize", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "park", args: ["park", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "promote", args: ["promote", "matrix"], setup: "provisional-stub", preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "Missing required input: --class" } },
  { commandPath: "release commit", args: ["release", "commit"], expected: { exitCode: 11, outputIncludes: "interlock-not-authorized" } },
  { commandPath: "release setup install", args: ["release", "setup", "install", "--json"], preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "missing required input" } },
  { commandPath: "release setup uninstall", args: ["release", "setup", "uninstall", "--harness", "matrix", "--json"], preservesWorktree: true, expected: { exitCode: 0, outputIncludes: "\"command\": \"uninstall\"" } },
  { commandPath: "rename", args: ["rename"], expected: { exitCode: 1 } },
  { commandPath: "reopen", args: ["reopen", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "repoint-design", args: ["repoint-design", "invalid"], expected: { exitCode: 1 } },
  { commandPath: "resume", args: ["resume", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "review", args: ["review", "reduce", "-"], stdin: "", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "\"code\":\"invalid-input\"" } },
  { commandPath: "review chunking resolve", args: ["review", "chunking", "resolve", "-"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "\"code\":\"invalid-input\"" } },
  { commandPath: "review frontline run", args: ["review", "frontline", "run", "-"], stdin: "{}\n", fixture: "arc-project", expected: { exitCode: 1, outputIncludes: "\"code\":\"invalid-input\"" } },
  { commandPath: "review planning-lane", args: ["review", "planning-lane", "invalid", "invalid"], expected: { exitCode: 64 } },
  { commandPath: "set-stage", args: ["set-stage", "invalid"], expected: { exitCode: 1 } },
  { commandPath: "start", args: ["start", "matrix", "--here"], setup: "planned-stub", preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "cannot start `matrix`" } },
  { commandPath: "status", args: ["status", "--json"], expected: { exitCode: 0, outputIncludes: "\"mode\":\"full\"" } },
  { commandPath: "stub", args: ["stub", "matrix"], preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "Missing required input" } },
  { commandPath: "sync", args: ["sync", "--json"], expected: { exitCode: 1, outputIncludes: "notes-blocked" } },
  { commandPath: "teardown", args: ["teardown", "matrix"], expected: { exitCode: 1 } },
  { commandPath: "update", args: ["update", "--quiet"], expected: { exitCode: 0, outputIncludes: "Update complete" } },
  { commandPath: "user open", args: ["user", "open", "matrix"], expected: { exitCode: 0, outputIncludes: "User workspace opened" } },
  { commandPath: "user pull", args: ["user", "pull"], preservesWorktree: true, expected: { exitCode: 1, outputIncludes: "Remote unavailable" } },
  { commandPath: "user reconcile-references", args: ["user", "reconcile-references", "--json"], expected: { exitCode: 0 } },
  { commandPath: "user sync", args: ["user", "sync"], expected: { exitCode: 1, outputIncludes: "No remote configured" } },
  { commandPath: "view", args: ["view"], expected: { exitCode: 1, outputIncludes: "No active work unit" } },
  { commandPath: "wu reconcile", args: ["wu", "reconcile", "--json"], expected: { exitCode: 1 } },
]);
