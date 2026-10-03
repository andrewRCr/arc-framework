/** Help-only descriptions, examples, and display order; registrations own command syntax. */

/** Presentation for one registered command. */
export interface HelpPage {
  readonly summary?: string;
  readonly purpose?: string;
  readonly examples?: readonly (readonly [string, string])[];
  readonly notes?: readonly (readonly [string, string])[];
  readonly optionGroups?: readonly (readonly [string, readonly string[]])[];
}

/** Task groups keyed by namespace path, with help-only member ordering. */
export const HELP_GROUPS: Readonly<Record<string, readonly (readonly [string, readonly string[]])[]>> = {
  "": [
    ["Inspect work and context:", ["status", "view", "active", "locus", "log", "recover"]],
    ["Plan and organize work:", ["start", "stub", "promote", "demote", "rename", "decompose", "plan", "set-stage", "finalize", "repoint-design"]],
    ["Run and resume work:", ["activate", "deactivate", "park", "resume", "materialize", "reopen", "abandon", "wu", "attest", "candidate"]],
    ["Review and land work:", ["review", "publish", "integrate", "merge", "base", "delivery", "release", "archive", "teardown"]],
    ["Run errands and synchronize:", ["errand", "housekeep", "sync", "user"]],
    ["Set up and maintain ARC:", ["init", "join", "update", "health", "diff", "check", "config", "extensions"]],
  ],
};

/** Intentional command presentation, independent of grammar and output behavior. */
export const COMMAND_HELP: Readonly<Record<string, HelpPage>> = {
  "": {
    purpose: "Plan, run, review, and land development work with ARC.",
    examples: [
      ["arc status --project", "See project work"],
      ["arc start my-work", "Start a planned work unit"],
      ["arc view tasks --current", "Display the current task"],
    ],
    notes: [["Learn more:", "arc <command> --help — Read command-specific help\n"
      + "arc review <command> --help — Read help within a namespace\n"
      + "Docs: https://github.com/andrewRCr/arc-framework#readme\n"
      + "Issues: https://github.com/andrewRCr/arc-framework/issues"]],
  },
  "check": { summary: "Run standalone repository checks" },
  "init": { summary: "Initialize ARC in the current project" },
  "join": { summary: "Join an existing ARC project" },
  "wu": { summary: "Manage the current work unit" },
  "start": { summary: "Start a work unit" },
  "stub": { summary: "Create a backlog work-unit stub" },
  "decompose": { summary: "Manage a work-unit decomposition" },
  "rename": { summary: "Rename a work unit and its identities" },
  "promote": { summary: "Promote a provisional stub to planned" },
  "demote": { summary: "Demote a planned stub to provisional" },
  "park": { summary: "Park a started work unit" },
  "resume": { summary: "Resume a parked work unit" },
  "materialize": { summary: "Check out a remote-only work unit" },
  "activate": { summary: "Activate a planning work unit" },
  "deactivate": { summary: "Return an active work unit to planning" },
  "publish": { summary: "Schedule an active work unit for publication" },
  "integrate": { summary: "Check readiness and merge work units" },
  "reopen": { summary: "Return an integrating work unit to active" },
  "abandon": { summary: "Destroy a pre-merge work unit" },
  "archive": { summary: "Archive a shipped work unit" },
  "teardown": { summary: "Clean up a retired work unit" },
  "set-stage": { summary: "Set the current planning stage" },
  "finalize": { summary: "Record planning ceremony completion facts" },
  "attest": { summary: "Attest a verified work-unit Candidate" },
  "candidate": { summary: "Manage Candidate lineage transitions" },
  "repoint-design": { summary: "Advance the current design pointer" },
  "errand": { summary: "Manage Errand lifecycles" },
  "housekeep": { summary: "Prepare to drain the user inbox" },
  "base": { summary: "Manage the local integration base" },
  "plan": { summary: "Check where planning can begin" },
  "delivery": { summary: "Author and manage delivery plans" },
  "update": { summary: "Update installed ARC framework files" },
  "health": { summary: "Show installed framework health" },
  "diff": { summary: "Compare installed and latest framework files" },
  "user": { summary: "Manage user directories and portable notes" },
  "extensions": { summary: "Inspect ARC extensions" },
  "config": { summary: "Inspect ARC configuration" },
  "active": { summary: "Inspect active ARC work" },
  "view": { summary: "Render an artifact from the current work context" },
  "status": {
    summary: "Inspect work, project, and session state",
    purpose: "Inspect work-unit state, project work, and session context.",
    examples: [
      ["arc status my-work --json", "Inspect an existing work unit as JSON"],
      ["arc status --project", "See the project work list"],
      ["arc status --session-init --json", "Read session initialization context"],
    ],
    optionGroups: [
      ["Work views:", ["--project", "--user"]],
      ["Session context:", ["--session-init", "--session-handoff", "--recover"]],
      ["Refresh:", ["--fetch", "--local", "--no-fetch"]],
      ["Project rendering:", ["--staged", "--write"]],
      ["Context writes:", ["--write-compaction-seed"]],
      ["Options:", ["--json", "--help"]],
    ],
    notes: [
      ["Defaults:", "Without a slug or view flag, inspect user sync, extensions, configuration, and active work.\n"
        + "Slug queries use local state by default. Ordinary --user and --project views read live refs by default; "
        + "use --local or --no-fetch for local views. Session-init does not itself select JSON; add --json."],
      ["Choose one:", "A slug, --project, --user, --session-init, --session-handoff, or --recover. "
        + "These modes are mutually exclusive."],
    ],
  },
  "locus": { summary: "Inspect checkout and session locations" },
  "recover": { summary: "Support recovery after harness compaction" },
  "sync": { summary: "Synchronize configured worktree and user-note concerns" },
  "release": { summary: "Validate and audit release operations" },
  "log": { summary: "Browse ARC commit history" },
  "merge": { summary: "Manage merge controls" },
  "review": { summary: "Resolve and execute review workflows" },
  "review resolve": {
    summary: "Resolve the next review-policy action",
    purpose: "Resolve the next configured review-policy action from a JSON request.",
    examples: [
      ["arc review resolve --schema", "Inspect the accepted request schema"],
      ["arc review resolve request.json", "Resolve a valid request file"],
      ["cat request.json | arc review resolve -", "Read a valid request from stdin"],
    ],
    notes: [
      ["Input and output:", "Supply exactly one request source or --schema. A request must match the schema, "
        + "and its facts must describe the actual review target and review state.\n"
        + "The review-policy result is JSON. --json is unsupported."],
      ["Related:", "arc review --help"],
    ],
  },
};
