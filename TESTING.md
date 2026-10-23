# Tested behavior

Release **v0.1.0** was installed globally from its public GitHub tarball using **OpenCode 1.19.4** on **macOS**, on 2026-10-23. Build/test tooling used **Node.js 24.22.0**. The live model runs used the existing OpenCode provider configuration.

## Installed-package observations

The native installer successfully resolved the public release, detected the server plugin entrypoint, and appended it to the existing global OpenCode plugin configuration:

```sh
opencode plugin --global https://github.com/autobelay/opencode-project-scoped-mcp/releases/download/v0.1.0/autobelay-opencode-project-scoped-mcp-0.1.0.tgz
```

Final runs used ordinary `opencode run --format json --dir <directory>` commands. They did not use `OPENCODE_CONFIG_CONTENT`, project configuration generation, a local-development plugin path, or a wrapper. Prompts requested only the specified read-only tools.

| Session directory | Observed result |
| --- | --- |
| Existing private project | All 19 project servers connected as native MCP connections; the project-only local read-only status tool succeeded. |
| This repository's root | No manifest and zero project MCP servers. Existing unrelated global MCP configuration remained present. |
| `examples/design-studio` | One project server connected; OpenCode called its native `read_design_tokens` tool and received the fictional Field Notes tokens. |

Private-project results are summarized only. Its manifest, company identifiers, server code, credentials and raw transcripts are not published. Discovery and one read-only call do not imply every downstream tool was executed.

The earlier local-development smoke test also showed the example server in `opencode mcp list` as a normal native connection. No generic bridge connection was used.

## Automated coverage

`npm test` passed nine tests using synthetic data:

- Nearest-manifest lookup, Git checkout/worktree stopping, and missing-directory handling.
- Stdio argv, environment interpolation, manifest-relative cwd, and input immutability.
- Remote HTTP/SSE mapping, bearer-header behavior, OAuth scope/client/redirect mapping, and invalid remote options.
- Native configuration precedence, disabled generated entries, and an invalid sibling entry.
- Distinct server IDs for different projects, worktrees and names that sanitize alike.
- Credential-free status output, redacted native failures, workspace-specific status requests and optional connection guidance.
- Independent project instances and no-manifest sessions.
- Malformed-manifest reporting without echoing file contents.
- No mutation of an MCP map shared with another workspace.

The tests inspect the built plugin as well as its source helpers. They do not use private projects or external services.

## Reproduce the public example

After installation:

```sh
gh repo clone autobelay/opencode-project-scoped-mcp
cd opencode-project-scoped-mcp/examples/design-studio
opencode run 'Use only project_mcp_status and the project-design MCP read_design_tokens tool. Report the fictional tokens. Do not use shell or modify files.'
```

At the repository root, ask `project_mcp_status` for the project server count; it should be zero. `opencode mcp list` may still show unrelated servers from your existing personal configuration.

## Compatibility evidence and limits

OpenCode 1.19.4 declares and invokes an asynchronous plugin config hook before MCP initialization. Its native MCP configuration supports local `cwd`; its remote connector manages authentication and tries Streamable HTTP then SSE. Sources: [plugin hook type](https://github.com/anomalyco/opencode/blob/v1.19.4/packages/plugin/src/index.ts), [hook invocation](https://github.com/anomalyco/opencode/blob/v1.19.4/packages/opencode/src/plugin/index.ts), [project bootstrap](https://github.com/anomalyco/opencode/blob/v1.19.4/packages/opencode/src/project/bootstrap.ts), [MCP service](https://github.com/anomalyco/opencode/blob/v1.19.4/packages/opencode/src/mcp/index.ts).

OAuth field translation and credential-ID separation were tested synthetically. An interactive OAuth login, the manual global-plugin-file installation alternative, other operating systems, older OpenCode versions, desktop-specific sessions and the separate v2 API were not exercised. The live remote servers used their preconfigured authentication.
