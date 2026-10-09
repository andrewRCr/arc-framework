/** Help-only descriptions, examples, and display order; registrations own command syntax. */

import { COMMAND_SUMMARIES } from "./cli-help-summaries.js";

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
    ["Set up and maintain ARC:", ["init", "join", "update", "health", "diff", "check", "config", "extensions", "schema"]],
  ],
  review: [
    ["Choose review work:", ["pre-publication", "resolve", "changeset"]],
    ["Run and respond:", ["frontline", "hosted", "local", "respond", "reduce", "terminus"]],
    ["Check readiness:", ["status", "readiness", "checks", "change-request", "merge-method"]],
    ["Clear planning changes:", ["planning-lane", "planning-grooming"]],
  ],
  user: [
    ["Inspect and synchronize:", ["status", "sync", "save", "load", "push", "fetch", "pull"]],
    ["Manage workspaces:", ["add", "open", "close"]],
    ["Maintain notes and inbox:", ["compact", "reconcile-references", "inbox-mark-execute-bound", "inbox-remove"]],
  ],
  errand: [
    ["Find and open work:", ["next", "check", "open", "link", "materialize"]],
    ["Pause and finish work:", ["leave", "merge", "close", "abandon", "promote"]],
  ],
  release: [
    ["Commit and push:", ["commit", "push"]],
    ["Configure and inspect:", ["status", "opt-in", "opt-out", "setup"]],
  ],
  delivery: [
    ["Prepare and transfer plans:", ["entry", "plan", "authoring", "eligibility", "compose", "transfer"]],
    ["Publish and inspect:", ["publish", "native", "position", "checks"]],
    ["Refresh and repair:", ["refresh", "review-fix", "reconcile", "rewrite", "rematerialize", "top-remedy"]],
    ["Land and clean up:", ["land", "teardown", "closeout"]],
  ],
};

const requestNotes: HelpPage["notes"] = [["Input and output:",
  "Provide exactly one JSON request file, - for stdin, or --schema. "
  + "Schema discovery prints the registered schema and referenced definitions.\n"
  + "JSON result output is automatic; --json is unsupported. Request facts must describe the actual target and state.",
]];

const requestSourceNotes: HelpPage["notes"] = [["Input and output:",
  "Read one JSON request from a file or - for stdin. The command result is JSON; no --json flag is needed.",
]];

const automaticRequestPaths = [
  "candidate applicability resolve",
  "merge lock resolve",
  "merge lock hold",
  "merge lock release",
  "user inbox-mark-execute-bound",
  "delivery authoring locate",
  "delivery authoring rematerialize",
  "delivery authoring rebind",
  "delivery closeout",
  "delivery entry inspect",
  "delivery checks observe",
  "delivery eligibility prepare",
  "delivery eligibility close",
  "delivery publish",
  "delivery native observe",
  "delivery native link",
  "delivery native unlink",
  "delivery native land-select",
  "delivery native land-prepare",
  "delivery native land-submit",
  "delivery native land-status",
  "delivery native land-release",
  "delivery refresh plan",
  "delivery refresh execute",
  "delivery refresh adopt",
  "delivery review-fix continue",
  "delivery review-fix plan",
  "delivery review-fix publish",
  "delivery review-fix acknowledge",
  "delivery position",
  "delivery land prepare",
  "delivery land apply",
  "delivery reconcile",
  "delivery rewrite",
  "delivery rematerialize",
  "delivery teardown",
  "delivery top-remedy"
] as const;

/** Intentional command presentation, independent of grammar and output behavior. */
export const COMMAND_HELP: Readonly<Record<string, HelpPage>> = {
  ...Object.fromEntries(Object.entries(COMMAND_SUMMARIES).map(([path, summary]) => [path, { summary }])),
  ...Object.fromEntries(automaticRequestPaths.map((path) => [path, {
    summary: COMMAND_SUMMARIES[path], notes: requestSourceNotes,
  }])),
  "errand merge": {
    summary: COMMAND_SUMMARIES["errand merge"],
    notes: [["Input and output:", "Read the exact approved merge request from a JSON file or - for stdin. "
      + "Use --json for the typed result; otherwise render the terminal outcome and continuation guidance."]],
  },
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
  "review changeset resolve": { summary: COMMAND_SUMMARIES["review changeset resolve"], notes: requestNotes },
  "review planning-grooming resolve": { summary: COMMAND_SUMMARIES["review planning-grooming resolve"], notes: requestNotes },
  "review frontline run": { summary: COMMAND_SUMMARIES["review frontline run"], notes: requestNotes },
  "review hosted await": { summary: COMMAND_SUMMARIES["review hosted await"], notes: requestNotes },
  "review reduce": { summary: COMMAND_SUMMARIES["review reduce"], notes: requestNotes },
  "review respond": { summary: COMMAND_SUMMARIES["review respond"], notes: requestNotes },
  "review hosted request": {
    summary: COMMAND_SUMMARIES["review hosted request"],
    examples: [
      ["arc review hosted request --schema", "Inspect the accepted request schema"],
      ["arc review hosted request request.json", "Submit a valid request file"],
    ],
    notes: requestNotes,
  },
  "review readiness": { summary: COMMAND_SUMMARIES["review readiness"], notes: requestNotes },
  "review frontline resolve": { summary: COMMAND_SUMMARIES["review frontline resolve"], notes: requestNotes },
  "review hosted settle": { summary: COMMAND_SUMMARIES["review hosted settle"], notes: requestNotes },
  "review local prepare": { summary: COMMAND_SUMMARIES["review local prepare"], notes: requestNotes },
  "review local attest": { summary: COMMAND_SUMMARIES["review local attest"], notes: requestNotes },
  "review local resume": { summary: COMMAND_SUMMARIES["review local resume"], notes: requestNotes },
  "review terminus accept": { summary: COMMAND_SUMMARIES["review terminus accept"], notes: requestNotes },
  "review": { summary: COMMAND_SUMMARIES["review"], notes: [["Related:", "arc review resolve --help"]] },
  "user": { summary: COMMAND_SUMMARIES["user"], notes: [["Related:", "arc user status --help"]] },
  "errand": { summary: COMMAND_SUMMARIES["errand"], notes: [["Related:", "arc errand open --help"]] },
  "release": { summary: COMMAND_SUMMARIES["release"], notes: [["Related:", "arc release commit --help"]] },
  "delivery": { summary: COMMAND_SUMMARIES["delivery"], notes: [["Related:", "arc delivery plan --help"]] },
  "start": {
    summary: COMMAND_SUMMARIES["start"],
    examples: [
      ["arc start my-work", "Start an existing planned target"],
      ["arc start fresh-work --new", "Create and start a new target"],
      ["arc start my-work --here", "Start the planned target in this checkout"],
    ],
    notes: [["Example context:", "my-work denotes an existing planned target; fresh-work denotes a new target. "
      + "--here uses the current checkout instead of the default isolated worktree."]],
  },
  "view": {
    summary: COMMAND_SUMMARIES["view"],
    purpose: "Display a work artifact for a person from the current ARC work context.",
    examples: [
      ["arc view tasks --current", "Display the current task"],
      ["arc view spec --for my-work", "Display a named work unit's spec"],
    ],
    notes: [["Example context:", "The current task requires a work context with a task list. "
      + "my-work denotes an existing work unit with a spec."]],
  },
  "errand open": {
    summary: COMMAND_SUMMARIES["errand open"],
    examples: [
      ["arc errand open my-fix", "Open an isolated atomic concern"],
      ['arc errand open my-fix --from-inbox "Fix the formatting issue"', "Adopt an existing inbox capture"],
      ["arc errand open my-fix --isolate", "Open in a new worktree, leaving the primary free"],
    ],
    notes: [["Example context:", "The quoted title must match an existing capture's inner bold title. "
      + "Review and merge require their own approvals."]],
  },
  "errand next": {
    summary: COMMAND_SUMMARIES["errand next"],
    examples: [["arc errand next --json", "Inspect the next execute-bound inbox capture"]],
  },
  "sync": {
    summary: COMMAND_SUMMARIES["sync"],
    examples: [
      ["arc sync --dry-run", "Inspect synchronization decisions"],
      ["arc sync", "Synchronize according to configured policies"],
    ],
  },
  "user status": {
    summary: COMMAND_SUMMARIES["user status"],
    examples: [
      ["arc user status", "Inspect local, remote, and on-disk note state"],
      ["arc user status --offline --json", "Inspect the local snapshot and disk as JSON"],
    ],
    notes: [["Example context:", "These examples assume a configured ARC identity and notes workspace. "
      + "--offline skips remote and worktree probes."]],
  },
  "release commit": {
    summary: COMMAND_SUMMARIES["release commit"],
    purpose: "Run release validation and forward Git arguments after the required approval.",
    examples: [["arc release commit -F message.txt", "Commit with a valid message file"]],
    notes: [["Example context:", "message.txt is a valid commit-message file for the configured message format. "
      + "Git commit arguments are forwarded through the release validation cascade."]],
  },
};
