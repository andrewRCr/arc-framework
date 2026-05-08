# Codex `prefix_rule` Allowlist Investigation

Date: 2026-05-07  
Codex CLI: `codex-cli 0.128.0`  
Host: Linux WSL2, `Linux OK-COMPUTER 5.15.167.4-microsoft-standard-WSL2 ... x86_64 GNU/Linux`  
User shell: `/bin/bash`; `/bin/zsh` was not installed in this environment.

## Setup

Active user config inspected:

- `/home/andrew/.codex/config.toml`
- `/home/andrew/.codex/rules/default.rules`
- `/home/andrew/.codex/policy/default.codexpolicy`

`config.toml` content:

```toml
personality = "pragmatic"

model_reasoning_effort = "xhigh"

[features]
codex_hooks = true

[projects."/home/andrew/dev/CineXplorer"]
trust_level = "trusted"

[projects."/home/andrew/dev/TaskFocus"]
trust_level = "trusted"

[projects."/home/andrew/dev/arc-portfolio"]
trust_level = "trusted"

[projects."/home/andrew/dev/arc-agentic-dev-framework"]
trust_level = "trusted"

[projects."/home/andrew/dev"]
trust_level = "trusted"

[projects."/home/andrew/dev/arc-framework"]
trust_level = "trusted"

[projects."/home/andrew/dev/zed-remedy-theme"]
trust_level = "trusted"

[tui]
status_line = ["model-with-reasoning", "five-hour-limit", "weekly-limit", "context-remaining", "context-window-size"]

[tui.model_availability_nux]
"gpt-5.5" = 4

[notice]
hide_rate_limit_model_nudge = true
```

`default.rules` already contained many unrelated pre-existing rules, including long heredoc rules. I temporarily
added these rules to the real file, verified them by re-reading the file, and removed them after testing:

```starlark
prefix_rule(pattern=["sentinel-cmd"], decision="allow")
prefix_rule(pattern=["sentinel-release", "commit"], decision="allow")
prefix_rule(pattern=["sentinel-release", "push"], decision="allow")
```

For reproducible noninteractive testing I also created an isolated Codex home at `/tmp/codex-home-sentinel` with
this rule file:

```starlark
prefix_rule(pattern=["sentinel-cmd"], decision="allow")
prefix_rule(pattern=["sentinel-release", "commit"], decision="allow")
prefix_rule(pattern=["sentinel-release", "push"], decision="allow")

prefix_rule(pattern=["/bin/bash"], decision="prompt", justification="Sentinel harness: shell wrapper fallback was matched.")
prefix_rule(pattern=["/usr/bin/bash"], decision="prompt", justification="Sentinel harness: shell wrapper fallback was matched.")
prefix_rule(pattern=["bash"], decision="prompt", justification="Sentinel harness: shell wrapper fallback was matched.")
prefix_rule(pattern=["/bin/zsh"], decision="prompt", justification="Sentinel harness: shell wrapper fallback was matched.")
prefix_rule(pattern=["zsh"], decision="prompt", justification="Sentinel harness: shell wrapper fallback was matched.")
```

That prompt-on-shell-wrapper rule is the key harness trick: if Codex unwraps `/bin/bash -lc "..."` to the underlying
`sentinel-*` argv, the allow rule runs. If unwrapping fails, the literal shell wrapper matches `/bin/bash` and
noninteractive `codex exec` rejects with `approval required by policy`.

Sentinel binaries:

- `/tmp/sentinel-cmd`
- `/tmp/sentinel-release`
- symlinks in `/home/andrew/.local/bin`

`/tmp/sentinel-cmd` recorded timestamp, `argv0`, args, `BASH_EXECUTION_STRING`, and parent command to `/tmp/sentinel.log`.

Raw matrix outputs are under `/tmp/codex-sentinel-matrix`:

- `T*.jsonl` / `A*.jsonl`: `codex exec --json` output
- `T*.sentinel.log` / `A*.sentinel.log`: per-test sentinel log

## Empirical Results

Interpretation of `Prompted?`: in the isolated noninteractive harness, `Y` means Codex hit the approval-required
path and rejected execution with `Rejected("approval required by policy, but AskForApproval is set to Never")`. In
an interactive approval UI, this is the branch that would prompt. `N` means the sentinel allow rule matched and the
command executed.

| ID | Invocation | Prompted? | `argv0` from sentinel log | Direct / Wrapped | Observation |
| --- | --- | ---: | --- | --- | --- |
| T1 | `sentinel-cmd hello` | N | `/home/andrew/.local/bin/sentinel-cmd` | Direct after unwrap | Plain command matched `["sentinel-cmd"]`. |
| T2 | `sentinel-cmd --message "hello world"` | N | `/home/andrew/.local/bin/sentinel-cmd` | Direct after unwrap | Double-quoted value with space matched. |
| T3 | `sentinel-cmd --message "fix: foo & bar"` | N | `/home/andrew/.local/bin/sentinel-cmd` | Direct after unwrap | `&` inside double quotes matched; not treated as shell operator. |
| T4 | `FOO=bar sentinel-cmd hello` | Y | none | Wrapped fallback | Env assignment made parser fail to unwrap; policy matched `/bin/bash`. |
| T5 | `sentinel-cmd hello > /tmp/redirect.log` | Y | none | Wrapped fallback | Redirection made parser fail to unwrap; policy matched `/bin/bash`. |
| T6 | `sentinel-cmd a && sentinel-cmd b` | N | two entries, `/home/andrew/.local/bin/sentinel-cmd` | Direct after unwrap | `&&` sequence matched because both simple commands matched. |
| T7 | `sentinel-cmd a; sentinel-cmd b` | N | two entries, `/home/andrew/.local/bin/sentinel-cmd` | Direct after unwrap | `;` sequence matched because both simple commands matched. |
| T8 | `sentinel-cmd --m "$(printf 'l1\nl2')"` | Y | none | Wrapped fallback | Command substitution made parser fail to unwrap. |
| T9 | `sentinel-release commit -m "test"` | N | `/tmp/sentinel-cmd` | Direct after unwrap | Subcommand shape matched `["sentinel-release", "commit"]`. |
| T10 | `sentinel-release push` | N | `/tmp/sentinel-cmd` | Direct after unwrap | Subcommand shape matched `["sentinel-release", "push"]`. |
| T11 | `sentinel-release commit -m "$(printf 'subj\n\nbody')"` | Y | none | Wrapped fallback | Command substitution in flag value blocked unwrapping. |

Additional follow-up tests:

| ID | Invocation | Prompted? | Observation |
| --- | --- | ---: | --- |
| A1 | `sentinel-release commit -m "fix: foo & bar"` | N | This mirrors the realistic commit-message shape; it matched reliably. |
| A2 | `sentinel-release commit -m $'subj\n\nbody'` | Y | ANSI-C `$'...'` quoting did not unwrap; policy fell back to `/bin/bash`. |

Runtime note: successful `codex exec --json` events still displayed commands as shell wrapped, for example
`/bin/bash -lc 'sentinel-release commit -m "test"'`. The policy engine nevertheless unwrapped those shell strings
for matching. The sentinel process then often had `parent=codex` because the shell `exec`s the final simple command;
parent process alone is not a reliable policy-match signal.

## Source Findings

Source cloned from `openai/codex` to `/tmp/codex-src`, commit `114bac1`.

The model-facing unified exec string is wrapped before execution:

- `/tmp/codex-src/codex-rs/core/src/tools/handlers/unified_exec.rs:120`
- `/tmp/codex-src/codex-rs/core/src/shell.rs:43`

Relevant code:

```rust
match shell_mode {
    UnifiedExecShellMode::Direct => {
        let model_shell = args.shell.as_ref().map(|shell_str| {
            let mut shell = get_shell_by_model_provided_path(&PathBuf::from(shell_str));
            shell.shell_snapshot = crate::shell::empty_shell_snapshot_receiver();
            shell
        });
        let shell = model_shell.as_ref().unwrap_or(session_shell.as_ref());
        Ok(shell.derive_exec_args(&args.cmd, use_login_shell))
    }
    UnifiedExecShellMode::ZshFork(zsh_fork_config) => Ok(vec![
        zsh_fork_config.shell_zsh_path.to_string_lossy().to_string(),
        if use_login_shell { "-lc" } else { "-c" }.to_string(),
        args.cmd.clone(),
    ]),
}
```

```rust
pub fn derive_exec_args(&self, command: &str, use_login_shell: bool) -> Vec<String> {
    match self.shell_type {
        ShellType::Zsh | ShellType::Bash | ShellType::Sh => {
            let arg = if use_login_shell { "-lc" } else { "-c" };
            vec![
                self.shell_path.to_string_lossy().to_string(),
                arg.to_string(),
                command.to_string(),
            ]
        }
```

The exec-policy matcher then tries to unwrap shell wrappers before applying `prefix_rule`:

- `/tmp/codex-src/codex-rs/core/src/exec_policy.rs:286`
- `/tmp/codex-src/codex-rs/core/src/exec_policy.rs:767`

Relevant code:

```rust
let ExecPolicyCommands {
    commands,
    used_complex_parsing,
    command_origin,
} = commands_for_exec_policy(command);
...
let evaluation = exec_policy.check_multiple_with_options(
    commands.iter(),
    &exec_policy_fallback,
    &match_options,
);
```

```rust
fn commands_for_exec_policy(command: &[String]) -> ExecPolicyCommands {
    if let Some(commands) = parse_shell_lc_plain_commands(command)
        && !commands.is_empty()
    {
        return ExecPolicyCommands {
            commands,
            used_complex_parsing: false,
            command_origin: ExecPolicyCommandOrigin::Generic,
        };
    }
    ...
    if let Some(single_command) = parse_shell_lc_single_command_prefix(command) {
        return ExecPolicyCommands {
            commands: vec![single_command],
            used_complex_parsing: true,
            command_origin: ExecPolicyCommandOrigin::Generic,
        };
    }

    ExecPolicyCommands {
        commands: vec![command.to_vec()],
        used_complex_parsing: false,
        command_origin: ExecPolicyCommandOrigin::Generic,
    }
}
```

The unwrapping parser accepts `bash`/`zsh`/`sh` `-c` or `-lc`, then accepts only word-only command sequences:

- `/tmp/codex-src/codex-rs/shell-command/src/bash.rs:22`
- `/tmp/codex-src/codex-rs/shell-command/src/bash.rs:97`

Relevant code:

```rust
const ALLOWED_KINDS: &[&str] = &[
    "program",
    "list",
    "pipeline",
    "command",
    "command_name",
    "word",
    "string",
    "string_content",
    "raw_string",
    "number",
    "concatenation",
];
const ALLOWED_PUNCT_TOKENS: &[&str] = &["&&", "||", ";", "|", "\"", "'"];
```

```rust
pub fn extract_bash_command(command: &[String]) -> Option<(&str, &str)> {
    let [shell, flag, script] = command else {
        return None;
    };
    if !matches!(flag.as_str(), "-lc" | "-c")
        || !matches!(
            detect_shell_type(&PathBuf::from(shell)),
            Some(ShellType::Zsh) | Some(ShellType::Bash) | Some(ShellType::Sh)
        )
    {
        return None;
    }
    Some((shell, script))
}
```

Finally, prefix matching is exact on argv tokens after that unwrapping step:

- `/tmp/codex-src/codex-rs/execpolicy/src/policy.rs:268`
- `/tmp/codex-src/codex-rs/execpolicy/src/rule.rs:37`

The policy first matches against `cmd[0]`, then the rule checks exact prefix tokens. If shell unwrapping fails,
`cmd[0]` is `/bin/bash`, `/usr/bin/bash`, `/bin/zsh`, etc., so a prefix rule for the underlying tool cannot match.

I attempted to add and run a focused Rust unit test in the clone, but this environment has no `cargo`, `rustc`, or
`bazel`, so source verification was by inspection plus runtime harness, not compiled local tests.

## Conclusions

For a command string that Codex wraps as `/bin/bash -lc "..."` or `/bin/zsh -lc "..."`, Codex 0.128.0 does attempt
to unwrap the shell command before `prefix_rule` matching.

Reliable matches:

- Plain positional command: `sentinel-cmd hello`
- Named flag with double-quoted value: `sentinel-cmd --message "hello world"`
- Special characters inside double quotes: `sentinel-cmd --message "fix: foo & bar"`
- Your realistic shape: `mytool release commit -m "fix: foo"` should match `["mytool", "release", "commit"]`
- Multiple plain commands joined by `&&` or `;`, if every parsed command is allowed

Fallbacks that fail to match the underlying tool prefix:

- Environment prefix: `FOO=bar mytool ...`
- Redirection: `mytool ... > file`
- Command substitution: `mytool -m "$(printf ...)"`
- ANSI-C `$'...'` quoting
- Any other shell construct outside the parser's narrow word-only grammar

The behavior is deterministic for a given command argv/script string: parse succeeds and matches the underlying
commands, or parse fails and policy evaluates the literal shell wrapper. What can vary across runs is the model's
chosen shell syntax if the user does not force an exact command.

There is no shell syntax that both uses redirection/substitution/env-prefix behavior and still makes the
`["mytool", "release", "commit"]` prefix match. To avoid wrapper ambiguity, the command must either be passed through
a direct argv-style tool path when available, or written in the accepted word-only shell subset. In this Codex tool
surface, the common `exec_command`/`shell_command` path is a shell-string path, so the practical mitigation is: keep
allowlisted invocations plain, and do multiline commit messages without shell substitution if you need the subcommand
prefix to match.
