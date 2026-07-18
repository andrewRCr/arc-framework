/**
 * Type contracts for `arc view` artifact resolution and rendering.
 */

export const VIEW_KINDS = [
  "tasks",
  "spec",
  "draft",
  "meta",
  "notes",
  "cohort",
  "session-notes",
  "working-memory",
  "inbox",
] as const;

export type ViewKind = typeof VIEW_KINDS[number];

export type ViewArtifactResult =
  | { status: "resolved"; kind: ViewKind; path: string }
  | { status: "absent"; kind: ViewKind }
  | { status: "error"; kind: string; message: string };

export interface ResolveViewArtifactOptions {
  cwd: string;
  kind: string;
  project: boolean;
  identity: string | null;
}

export type ViewArtifactResolver = (
  options: ResolveViewArtifactOptions,
) => Promise<ViewArtifactResult>;

export interface RunViewOptions {
  cwd: string;
  kind?: string;
  project: boolean;
  identity: string | null;
  current?: boolean;
  nonInteractive?: boolean;
}

export interface ViewOutput {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1;
}
