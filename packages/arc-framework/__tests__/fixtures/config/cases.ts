/** Shared data-only corpus for ARC configuration compatibility adapters. */

export const CONFIG_COMPATIBILITY_KINDS = [
  "valid",
  "invalid",
  "absent",
  "bare-empty",
  "quoted-empty",
  "unknown",
  "duplicate",
  "precedence",
] as const;

export type ConfigCompatibilityKind = (typeof CONFIG_COMPATIBILITY_KINDS)[number];
export type ConfigValueSource = "git-config" | "yaml" | "default";

interface StatusExpectation {
  readonly settings: Readonly<Record<string, string>>;
  readonly defaulted: readonly string[];
  readonly notDefaulted: readonly string[];
  readonly warningIncludes: readonly string[];
}

interface ResolvedExpectation {
  readonly notesPush: { readonly value: string; readonly source: ConfigValueSource };
  readonly warningIncludes: readonly string[];
}

interface CommitCheckExpectation {
  readonly kind: "active" | "disabled" | "invalid";
  readonly findingCodes: readonly string[];
}

type ValueOrThrow =
  | { readonly kind: "value"; readonly value: string | readonly string[] }
  | { readonly kind: "throws"; readonly messageIncludes: string };

interface WorktreeExpectation {
  readonly location: ValueOrThrow;
  readonly harnessDirs: ValueOrThrow;
}

interface ValidatorExpectation {
  readonly passes: number;
  readonly warnings: number;
  readonly errors: number;
  readonly exitCode: 0 | 1 | 2;
  readonly lineIncludes: readonly string[];
}

export interface ConfigCompatibilityCase {
  readonly id: string;
  readonly kinds: readonly ConfigCompatibilityKind[];
  /** Null represents a selected config path that does not exist. */
  readonly config: string | null;
  readonly gitConfig: Readonly<Record<string, string>>;
  readonly expected: {
    readonly status: StatusExpectation;
    readonly resolved: ResolvedExpectation;
    readonly commitCheck: CommitCheckExpectation;
    readonly worktree: WorktreeExpectation;
    readonly validator: ValidatorExpectation;
  };
}

export const CONFIG_COMPATIBILITY_CASES: readonly ConfigCompatibilityCase[] = [
  {
    id: "missing-file-selects-adapter-defaults",
    kinds: ["absent"],
    config: null,
    gitConfig: {},
    expected: {
      status: {
        settings: {
          "commit.format": "conventional",
          "user.notes_push": "on-sync",
          "worktree.location_template": "../{repo}.{name}",
          "worktree.harness_dirs": ".claude,.codex,.gemini,.opencode",
        },
        defaulted: ["commit.format", "user.notes_push", "worktree.location_template", "worktree.harness_dirs"],
        notDefaulted: [],
        warningIncludes: ["Unable to read arc-config.yml"],
      },
      resolved: {
        notesPush: { value: "on-sync", source: "default" },
        warningIncludes: ["Unable to read arc-config.yml"],
      },
      commitCheck: { kind: "active", findingCodes: [] },
      worktree: {
        location: { kind: "value", value: "../arc-framework.example" },
        harnessDirs: { kind: "value", value: [".claude", ".codex", ".gemini", ".opencode"] },
      },
      validator: {
        passes: 0,
        warnings: 0,
        errors: 1,
        exitCode: 2,
        lineIncludes: ["ERROR Config file not found: selected.yml", "Summary: 0 passed, 0 warnings, 1 error"],
      },
    },
  },
  {
    id: "valid-values-survive-each-policy-boundary",
    kinds: ["valid"],
    config: [
      "commit.format: any",
      "hooks.subject_max_length: 00080",
      "user.notes_push: prompt",
      "sync.auto_pull: true",
      "worktree.location_template: ../{repo}.{branch}",
      "worktree.harness_dirs: .codex, .claude,.codex",
    ].join("\n"),
    gitConfig: {},
    expected: {
      status: {
        settings: {
          "commit.format": "any",
          "hooks.subject_max_length": "00080",
          "user.notes_push": "prompt",
          "sync.auto_pull": "true",
          "worktree.location_template": "../{repo}.{branch}",
          "worktree.harness_dirs": ".codex, .claude,.codex",
        },
        defaulted: [],
        notDefaulted: [
          "commit.format",
          "hooks.subject_max_length",
          "user.notes_push",
          "sync.auto_pull",
          "worktree.location_template",
          "worktree.harness_dirs",
        ],
        warningIncludes: [],
      },
      resolved: { notesPush: { value: "prompt", source: "yaml" }, warningIncludes: [] },
      commitCheck: { kind: "active", findingCodes: [] },
      worktree: {
        location: { kind: "value", value: "../arc-framework.feat-example" },
        harnessDirs: { kind: "value", value: [".codex", ".claude"] },
      },
      validator: {
        passes: 25,
        warnings: 0,
        errors: 0,
        exitCode: 0,
        lineIncludes: ["PASS  commit.format: any", "PASS  hooks.subject_max_length: 00080"],
      },
    },
  },
  {
    id: "invalid-values-retain-adapter-specific-failure-policy",
    kinds: ["invalid"],
    config: [
      "commit.format: strict",
      "hooks.subject_max_length: 9",
      "user.notes_push: never",
      "sync.auto_pull: sometimes",
      "worktree.location_template: ''",
      "worktree.harness_dirs: .git",
    ].join("\n"),
    gitConfig: {},
    expected: {
      status: {
        settings: {
          "commit.format": "strict",
          "hooks.subject_max_length": "9",
          "user.notes_push": "never",
          "sync.auto_pull": "false",
          "worktree.location_template": "",
          "worktree.harness_dirs": ".git",
        },
        defaulted: [],
        notDefaulted: ["commit.format", "user.notes_push", "sync.auto_pull", "worktree.location_template"],
        warningIncludes: ["sync.auto_pull", "sometimes"],
      },
      resolved: {
        notesPush: { value: "on-sync", source: "default" },
        warningIncludes: ["user.notes_push", "never"],
      },
      commitCheck: {
        kind: "invalid",
        findingCodes: ["config.invalid-value", "config.invalid-number"],
      },
      worktree: {
        location: { kind: "throws", messageIncludes: "Too small" },
        harnessDirs: { kind: "throws", messageIncludes: "reserved directory" },
      },
      validator: {
        passes: 21,
        warnings: 0,
        errors: 5,
        exitCode: 2,
        lineIncludes: [
          "ERROR commit.format: 'strict' is not valid",
          "ERROR hooks.subject_max_length: '9' must be an unsigned base-10 safe integer >= 10",
          "ERROR worktree.location_template: '' is not valid",
        ],
      },
    },
  },
  {
    id: "bare-empty-definitions-select-defaults",
    kinds: ["bare-empty"],
    config: [
      "commit.format:",
      "user.notes_push:",
      "sync.auto_pull:",
      "worktree.location_template:",
      "worktree.harness_dirs:",
    ].join("\n"),
    gitConfig: {},
    expected: {
      status: {
        settings: {
          "commit.format": "conventional",
          "user.notes_push": "on-sync",
          "sync.auto_pull": "false",
          "worktree.location_template": "../{repo}.{name}",
          "worktree.harness_dirs": ".claude,.codex,.gemini,.opencode",
        },
        defaulted: [
          "commit.format",
          "user.notes_push",
          "sync.auto_pull",
          "worktree.location_template",
          "worktree.harness_dirs",
        ],
        notDefaulted: [],
        warningIncludes: [],
      },
      resolved: { notesPush: { value: "on-sync", source: "default" }, warningIncludes: [] },
      commitCheck: { kind: "active", findingCodes: [] },
      worktree: {
        location: { kind: "value", value: "../arc-framework.example" },
        harnessDirs: { kind: "value", value: [".claude", ".codex", ".gemini", ".opencode"] },
      },
      validator: {
        passes: 25,
        warnings: 0,
        errors: 0,
        exitCode: 0,
        lineIncludes: ["PASS  commit.format: [absent, default: conventional]"],
      },
    },
  },
  {
    id: "quoted-empty-definitions-remain-present",
    kinds: ["quoted-empty"],
    config: [
      "commit.format: ''",
      "user.notes_push: \"\"",
      "sync.auto_pull: ''",
      "worktree.location_template: \"\"",
      "worktree.harness_dirs: ''",
    ].join("\n"),
    gitConfig: {},
    expected: {
      status: {
        settings: {
          "commit.format": "",
          "user.notes_push": "",
          "sync.auto_pull": "false",
          "worktree.location_template": "",
          "worktree.harness_dirs": "",
        },
        defaulted: [],
        notDefaulted: [
          "commit.format",
          "user.notes_push",
          "sync.auto_pull",
          "worktree.location_template",
          "worktree.harness_dirs",
        ],
        warningIncludes: ["sync.auto_pull"],
      },
      resolved: {
        notesPush: { value: "on-sync", source: "default" },
        warningIncludes: ["user.notes_push"],
      },
      commitCheck: { kind: "invalid", findingCodes: ["config.invalid-value"] },
      worktree: {
        location: { kind: "throws", messageIncludes: "Too small" },
        harnessDirs: { kind: "value", value: [] },
      },
      validator: {
        passes: 25,
        warnings: 0,
        errors: 1,
        exitCode: 2,
        lineIncludes: [
          "PASS  commit.format: [absent, default: conventional]",
          "ERROR worktree.location_template: '' is not valid",
        ],
      },
    },
  },
  {
    id: "unknown-keys-are-tolerated-or-warned-at-the-owning-boundary",
    kinds: ["unknown"],
    config: "unknown.setting: first\nunknown.setting: second",
    gitConfig: {},
    expected: {
      status: {
        settings: { "user.notes_push": "on-sync" },
        defaulted: ["user.notes_push"],
        notDefaulted: [],
        warningIncludes: [],
      },
      resolved: { notesPush: { value: "on-sync", source: "default" }, warningIncludes: [] },
      commitCheck: { kind: "active", findingCodes: [] },
      worktree: {
        location: { kind: "value", value: "../arc-framework.example" },
        harnessDirs: { kind: "value", value: [".claude", ".codex", ".gemini", ".opencode"] },
      },
      validator: {
        passes: 25,
        warnings: 2,
        errors: 0,
        exitCode: 1,
        lineIncludes: ["WARN  Unknown key: 'unknown.setting' (possible typo?)"],
      },
    },
  },
  {
    id: "duplicate-known-keys-use-the-first-definition",
    kinds: ["duplicate"],
    config: [
      "commit.format: any",
      "commit.format: custom",
      "user.notes_push: prompt",
      "user.notes_push: manual",
      "worktree.location_template: ../{repo}.{name}",
      "worktree.location_template: ../ignored/{branch}",
    ].join("\n"),
    gitConfig: {},
    expected: {
      status: {
        settings: {
          "commit.format": "any",
          "user.notes_push": "prompt",
          "worktree.location_template": "../{repo}.{name}",
        },
        defaulted: [],
        notDefaulted: ["commit.format", "user.notes_push", "worktree.location_template"],
        warningIncludes: [],
      },
      resolved: { notesPush: { value: "prompt", source: "yaml" }, warningIncludes: [] },
      commitCheck: { kind: "active", findingCodes: [] },
      worktree: {
        location: { kind: "value", value: "../arc-framework.example" },
        harnessDirs: { kind: "value", value: [".claude", ".codex", ".gemini", ".opencode"] },
      },
      validator: {
        passes: 25,
        warnings: 0,
        errors: 0,
        exitCode: 0,
        lineIncludes: ["PASS  commit.format: any"],
      },
    },
  },
  {
    id: "git-config-precedes-the-yaml-project-default",
    kinds: ["precedence"],
    config: "user.notes_push: prompt",
    gitConfig: { "arc.notesPush": "manual" },
    expected: {
      status: {
        settings: { "user.notes_push": "prompt" },
        defaulted: [],
        notDefaulted: ["user.notes_push"],
        warningIncludes: [],
      },
      resolved: { notesPush: { value: "manual", source: "git-config" }, warningIncludes: [] },
      commitCheck: { kind: "active", findingCodes: [] },
      worktree: {
        location: { kind: "value", value: "../arc-framework.example" },
        harnessDirs: { kind: "value", value: [".claude", ".codex", ".gemini", ".opencode"] },
      },
      validator: {
        passes: 25,
        warnings: 0,
        errors: 0,
        exitCode: 0,
        lineIncludes: ["PASS  user.notes_push: prompt"],
      },
    },
  },
] as const;
