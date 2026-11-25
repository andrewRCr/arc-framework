/** Shared CLI help presentation, retaining Commander's syntax and visibility rules. */

import { Command, Help } from "commander";

import { COMMAND_HELP, HELP_GROUPS, type HelpPage } from "./cli-help-content.js";

const errorContexts = new WeakSet<Help>();

/**
 * Return the command's metadata key, without the program name.
 * @param command - Registered Commander command.
 * @returns Space-separated command path.
 */
export function helpCommandPath(command: Command): string {
  const parts: string[] = [];
  for (let current = command; current.parent !== null; current = current.parent) parts.unshift(current.name());
  return parts.join(" ");
}

/**
 * Install help configuration before creating children so they inherit it.
 * @param program - Root Commander program.
 * @returns Nothing.
 */
export function configureArcHelp(program: Command): void {
  program.configureHelp({
    showGlobalOptions: true,
    minWidthToWrap: 20,
    prepareContext(this: Help, context) {
      Help.prototype.prepareContext.call(this, context);
      if (context.error === true) errorContexts.add(this);
    },
    formatHelp: formatArcHelp,
  });
}

/**
 * Apply presentation metadata after registration without reordering the tree.
 * @param program - Completed Commander command tree.
 * @returns Nothing.
 */
export function applyArcHelp(program: Command): void {
  const visit = (command: Command): void => {
    const path = helpCommandPath(command);
    const page = COMMAND_HELP[path];
    if (page?.summary !== undefined) command.summary(page.summary);
    if (page?.purpose !== undefined) command.description(page.purpose);
    const groups = HELP_GROUPS[path];
    for (const [heading, members] of groups ?? []) {
      for (const child of command.commands) {
        if (members.includes(child.name())) child.helpGroup(heading);
      }
    }
    for (const child of command.commands) visit(child);
  };
  visit(program);
}

function visibleCommands(command: Command, helper: Help): Command[] {
  const commands = helper.visibleCommands(command);
  const groups = HELP_GROUPS[helpCommandPath(command)];
  if (groups === undefined) return commands;
  const order = groups.flatMap(([, members]) => members);
  const rank = (name: string): number => {
    const index = order.indexOf(name);
    return index === -1 ? order.length : index;
  };
  for (const child of commands) {
    if (child.name() === "help") child.helpGroup("Help:").summary("Show help for a command");
  }
  return commands.sort((a, b) => {
    if (a.name() === "help") return 1;
    if (b.name() === "help") return -1;
    return rank(a.name()) - rank(b.name());
  });
}

function bareIntroduction(command: Command, helper: Help): boolean {
  if (command.parent !== null || !errorContexts.has(helper)) return false;
  return command.args.length === 0
    && command.options.every((option) => command.getOptionValueSource(option.attributeName()) !== "cli");
}

function examples(page: HelpPage | undefined, helper: Help, width: number): string[] {
  return helper.formatItemList("Examples:", (page?.examples ?? []).map(([term, description]) => {
    if ((helper.helpWidth ?? 80) - width - 4 < helper.minWidthToWrap) {
      return `  ${term}\n${helper.formatItem("", 0, description, helper)}`;
    }
    return helper.formatItem(term, width, description, helper);
  }), helper);
}

function notes(page: HelpPage | undefined, helper: Help): string[] {
  return (page?.notes ?? []).flatMap(([heading, text]) => [
    helper.styleTitle(heading),
    ...text.split("\n").map((line) => `  ${helper.boxWrap(line, (helper.helpWidth ?? 80) - 2)
      .replace(/\n/gu, "\n  ")}`),
    "",
  ]);
}

function visibleOptions(command: Command, helper: Help, page: HelpPage | undefined): ReturnType<Help["visibleOptions"]> {
  const options = helper.visibleOptions(command);
  if (page?.optionGroups === undefined) return options;
  const order = page.optionGroups.flatMap(([, flags]) => flags);
  for (const [heading, flags] of page.optionGroups) {
    for (const option of options) {
      if (flags.includes(option.long ?? option.short ?? "")) option.helpGroup(heading);
    }
  }
  const rank = (flag: string): number => {
    const index = order.indexOf(flag);
    return index === -1 ? order.length : index;
  };
  return options.sort((a, b) => rank(a.long ?? a.short ?? "") - rank(b.long ?? b.short ?? ""));
}

function formatArcHelp(command: Command, helper: Help): string {
  const page = COMMAND_HELP[helpCommandPath(command)];
  const intro = bareIntroduction(command, helper);
  const width = helper.padWidth(command, helper);
  const exampleWidth = Math.max(width, ...(page?.examples ?? []).map(([term]) => helper.displayWidth(term)));
  const item = (term: string, description: string): string => helper.formatItem(term, width, description, helper);
  const list = (heading: string, items: string[]): string[] => helper.formatItemList(heading, items, helper);
  const output = [
    `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(command))}`, "",
  ];
  const purpose = helper.commandDescription(command);
  if (purpose !== "") output.push(helper.boxWrap(helper.styleCommandDescription(purpose), helper.helpWidth ?? 80), "");
  output.push(...examples(page, helper, exampleWidth));
  output.push(...list("Arguments:", helper.visibleArguments(command).map((argument) => item(
    helper.styleArgumentTerm(helper.argumentTerm(argument)),
    helper.styleArgumentDescription(helper.argumentDescription(argument)),
  ))));
  const options = visibleOptions(command, helper, page);
  for (const [heading, members] of helper.groupItems(options, options, (option) => option.helpGroupHeading ?? "Options:")) {
    output.push(...list(heading, members.map((option) => item(
      helper.styleOptionTerm(helper.optionTerm(option)),
      helper.styleOptionDescription(helper.optionDescription(option)),
    ))));
  }
  output.push(...list("Global options:", helper.visibleGlobalOptions(command).map((option) => item(
    helper.styleOptionTerm(helper.optionTerm(option)),
    helper.styleOptionDescription(helper.optionDescription(option)),
  ))));
  if (intro) {
    output.push(...list("More help:", [
      item("arc --help", "List every command, grouped by task"),
      item("arc <command> --help", "Read command-specific help"),
    ]));
  } else {
    const commands = visibleCommands(command, helper);
    for (const [heading, members] of helper.groupItems(commands, commands, (child) => child.helpGroup() || "Commands:")) {
      output.push(...list(heading, members.map((child) => item(
        helper.styleSubcommandTerm(helper.subcommandTerm(child)),
        helper.styleSubcommandDescription(helper.subcommandDescription(child)),
      ))));
    }
    output.push(...notes(page, helper));
  }
  return output.join("\n");
}
