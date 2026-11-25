/** Interrupt bounded caller capture work while preserving cleanup and opened-handle ownership. */
import type { CheckExecutionIO } from "./execution.js";
import type { EnvironmentCaptureIO } from "../environment-file.js";

/** Apply one attempt signal to Git, filesystem observations and bounded file-copy operations. */
export function interruptibleCaptureIO(io: CheckExecutionIO, signal: AbortSignal): CheckExecutionIO {
  const before = <Args extends unknown[], Result>(operation: (...args: Args) => Result) => (...args: Args): Result => {
    signal.throwIfAborted();
    return operation(...args);
  };
  const files: EnvironmentCaptureIO = {
    createDirectory: before(() => io.source.files.createDirectory()),
    removeDirectory: path => io.source.files.removeDirectory(path),
    openInput: before(async path => {
      const file = await io.source.files.openInput(path);
      return { stat: before(() => file.stat()), read: before((buffer: Buffer) => file.read(buffer)), close: () => file.close() };
    }),
    openOutput: before(async path => {
      const file = await io.source.files.openOutput(path);
      return { write: before((buffer: Buffer) => file.write(buffer)), close: () => file.close() };
    }),
  };
  return { ...io,
    git: before((command, args, options) => io.git(command, args, { ...options,
      signal: options?.signal === undefined ? signal : AbortSignal.any([signal, options.signal]) })),
    gitRaw: before((args, options) => io.gitRaw(args, { ...options,
      signal: options?.signal === undefined ? signal : AbortSignal.any([signal, options.signal]) })),
    source: { ...io.source, files, lstat: before(path => io.source.lstat(path)), stat: before(path => io.source.stat(path)),
      realpath: before(path => io.source.realpath(path)), readDirectory: before(path => io.source.readDirectory(path)),
      readManifest: before(path => io.source.readManifest(path)), readlink: before(path => io.source.readlink(path)),
      symlink: before((target, path, type) => io.source.symlink(target, path, type)), mkdir: before(path => io.source.mkdir(path)),
      chmod: before((path, mode) => io.source.chmod(path, mode)), writeManifest: before((path, content) => io.source.writeManifest(path, content)) },
  };
}
