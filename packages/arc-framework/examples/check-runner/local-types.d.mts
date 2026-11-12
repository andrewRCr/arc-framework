/** Public wire records and private worker messages used by the standalone example. */
export interface SourceCoordinates { tree: string; head?: string; base?: string; merged: string[] }
export interface FileIdentity { bytes?: unknown; digest?: unknown; mode?: unknown }
export interface SourceEntry extends FileIdentity { path: unknown; kind: unknown; target?: unknown }
export interface SourceManifest { version: number; coordinates: SourceCoordinates; entries?: SourceEntry[] | null }
export interface Content { tree: string; base?: string; merged?: string[] }
export interface Invocation {
  id: string; argv: [string, ...string[]]; cwd: unknown; shell: boolean; commandContent?: Content;
}
export type Probe = Omit<Invocation, "shell" | "commandContent"> & { shell?: false };
export type Binding = { kind: "value"; state: "set"; value: string }
  | { kind: "value"; state: "unset" }
  | { kind: "file"; state: "file"; path: string; bytes: number; digest: string }
  | { kind: "file"; state: "unset" | "empty" };
export interface Plan {
  protocolVersion: number; planId: string;
  source: { root: string; manifest: string; digest: string; coordinates: SourceCoordinates };
  environment: Record<string, Binding>;
  probes: { global: Probe[]; check: Probe[] }; invocations: Invocation[];
}
export interface Completed { status: "completed"; exitCode: number; notice?: string; notRunReason?: string }
export interface Unavailable { status: "unavailable"; reason: string; remedy: string }
export interface Cancelled { status: "cancelled"; reason: string }
export type Outcome = Completed | Unavailable | Cancelled;
export interface ProbeResult { outcome: Outcome; stdout: Buffer; overflow: boolean }
export type Runtime = { kind: "unknown"; reason: string }
  | { kind: "known"; bindings: { invocationId: string; identity: string; probes: { id: string; stdout: string }[] }[] };
export interface ActiveChild { pid: number | undefined; stop(): void }
export interface Control { cancelled: boolean; active: ActiveChild | undefined }
export interface ProcessState { state: string | undefined; group: number; birth: string | undefined }
export type ReadProcess = (pid: number) => Promise<ProcessState | undefined>;
export interface OwnerRecord { pid: number; birth: string }
export interface WorkerRecord extends OwnerRecord { done: unknown }
export interface WorkerRequest {
  invocation: Pick<Invocation, "argv" | "shell">; cwd: string; environment: NodeJS.ProcessEnv; timeout: number;
}
export type WorkerMessage = { ready: true; nativeFailure?: undefined }
  | { ready?: undefined; nativeFailure: Completed }
  | (Outcome & { ready?: undefined; nativeFailure?: undefined });
export interface CloseStatus { code: number | null; signal: NodeJS.Signals | null }
export type Output = (stream: "stdout" | "stderr", bytes: Buffer) => void | Promise<void>;
export type ObserveFailure = (failure: Completed) => Promise<void>;
export interface ExecutionState {
  outcome?: Outcome; started: boolean; launchError?: Error; failure?: Completed;
  timedOut: boolean; deadline?: ReturnType<typeof setTimeout>; observationError?: unknown;
}
export type Request = { id: string; method: "check/prepare"; params: Plan }
  | { id: string; method: "check/run"; params: { contextId: string; invocationId: string } }
  | { id: string; method: "check/cancel"; params: { planId: string; contextId?: string } }
  | { id: string; method: "check/release"; params: { contextId: string } };
export interface AdapterState {
  plan?: Plan; directory?: string; contextId?: string; runtime?: Runtime; administration?: string;
  busy?: Promise<void>; ended: boolean; failed: boolean;
}
