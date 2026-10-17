/** Pin one operation to its store repository without inheriting code-repository configuration. */
import type { RefBackendContext } from "./context.js";

/** Bind all executor variants while keeping identity and locks rooted in the code checkout. */
export function bindRefRepository(context: RefBackendContext, commonDir: string, gitDir: string | null): RefBackendContext {
  const repository = { commonDir, gitDir };
  if (gitDir === null) return { ...context, repository };
  let person: Promise<string[]> | undefined;
  const argsFor = async (args: string[]): Promise<string[]> => [
    `--git-dir=${gitDir}`,
    ...args[0] === "commit-tree" ? await (person ??= codePerson(context)) : [],
    ...args,
  ];
  return { ...context, repository,
    exec: async (command, args, options) => context.exec(command, await argsFor(args), { ...options, cwd: context.checkoutRoot }),
    execInput: async (args, input, options) => context.execInput(await argsFor(args), input, { ...options, cwd: context.checkoutRoot }),
    rawExec: async (args, options) => context.rawExec(await argsFor(args), { ...options, cwd: context.checkoutRoot }),
  };
}

async function codePerson(context: RefBackendContext): Promise<string[]> {
  const identities = await Promise.all(["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"].map(async (variable) => {
    const { stdout } = await context.exec("git", ["var", variable], { cwd: context.checkoutRoot });
    const parsed = /^(.*) <([^<>]*)> -?\d+ [+-]\d{4}$/u.exec(stdout.trim());
    if (!parsed) throw new Error(`Git returned an invalid ${variable} for the code repository`);
    return { name: parsed[1] ?? "", email: parsed[2] ?? "" };
  }));
  return identities.flatMap(({ name, email }, index) => {
    const role = index === 0 ? "author" : "committer";
    return ["-c", `${role}.name=${name}`, "-c", `${role}.email=${email}`];
  });
}
