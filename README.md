# OpenCode Project-scoped MCP

Install one OpenCode plugin. Open a project containing `mcp.json`. OpenCode connects to the MCP servers declared by that project.

The plugin reads the nearest manifest when OpenCode loads a project and adds its servers to OpenCode's configuration in memory. OpenCode itself runs the local commands, connects to remote servers, manages OAuth, and exposes their tools. There is no MCP bridge, launch wrapper, configuration copy, background watcher, or project-specific OpenCode file to maintain.

This release targets OpenCode **1.19.4**. OpenCode's [v2 plugin API](https://opencode.ai/v2/docs/build/plugins) and `mcp.servers` configuration have different shapes and are not supported by this release.

## Install

Install the GitHub release globally using OpenCode’s native plugin installer:

```sh
opencode plugin --global https://github.com/autobelay/opencode-project-scoped-mcp/releases/download/v0.1.0/autobelay-opencode-project-scoped-mcp-0.1.0.tgz
```

OpenCode 1.19.4 uses `opencode plugin <module> -g` for a global install; `opencode plugin add` belongs to the separate v2 CLI. An alternative that uses the [documented global plugin directory](https://docs.opencode.ai/docs/plugins/#from-local-files) is to copy the built, dependency-free `dist/plugin.js` to `~/.config/opencode/plugins/project-scoped-mcp.js`. OpenCode 1.19.4 auto-discovers `.js` and `.ts` files in that directory; it does not auto-discover `.mjs` there.

Start OpenCode in a project with a manifest:

```sh
cd /path/to/project
opencode
```

Ask: “Use `project_mcp_status` to show this project's MCP connections.” Native MCP tools are available separately under their generated server IDs. No project path is stored in the global installation.

## Why project-scoped tools?

An MCP server may need a particular checkout's files, branch, design tokens, or credentials. Keeping its declaration with the project lets the configuration travel with that code. A user installs this plugin once, while each project can declare its own servers without copying entries into the user's OpenCode configuration.

This plugin uses OpenCode's [plugin `config` hook](https://docs.opencode.ai/docs/plugins/) before native MCP connections initialize. The project manifest is read at that point. Changes to `mcp.json` take effect when the project is loaded again, such as in a new OpenCode process.

## Example: a design assistant for one application

Imagine a fictional field-notes application. Its design MCP could know the current checkout's palette, spacing, component variants, unpublished screen references, and navigation conventions. Its tools might read design tokens or explain the layout of a component. These assets and conventions belong to one application; publishing a generic public MCP would not supply them. Hosting this server remotely would require uploading or synchronizing unpublished branch-specific files. Keeping the server in the checkout lets it read the exact branch being edited. The server may still use a remote service for specific operations; local execution does not imply offline operation.

The runnable [design-studio example](examples/design-studio) is smaller. Its read-only tool returns fictional design tokens. It requires no account, credentials, cloud service, or company material:

```sh
gh repo clone autobelay/opencode-project-scoped-mcp
cd opencode-project-scoped-mcp/examples/design-studio
opencode
```

Ask OpenCode to read the project's design tokens using its project-design MCP server.

## Project manifest

Place `mcp.json` in a checkout. The plugin walks upward from the OpenCode project directory to the nearest `mcp.json`, stopping at a Git checkout root. A nested checkout does not inherit a parent's manifest. A worktree uses the manifest and files in its own checkout. If none is found, the status tool reports that no project manifest was found.

```json
{
  "mcpServers": {
    "project-design": {
      "type": "stdio",
      "title": "Project design assistant",
      "description": "Read this checkout's design tokens and screen references.",
      "command": "node",
      "args": ["tooling/design/server.mjs"],
      "env": { "DESIGN_TOKEN_FILE": "tooling/design/tokens.json" }
    },
    "project-docs": {
      "type": "streamable-http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${env:DOCS_TOKEN}" }
    }
  }
}
```

The remote URL is illustrative. The supported manifest transports are `stdio`, `streamable-http`, and `sse`. For local servers, `command` and `args` become OpenCode's command array, `env` becomes `environment`, and OpenCode launches the process with the manifest directory as `cwd`. For remote servers, the plugin passes the URL and headers to OpenCode, which attempts Streamable HTTP and then SSE. Generated connections use a 30-second request timeout; a native OpenCode entry can override it.

The manifest follows a practical subset of the evolving [SEP-2633 client configuration proposal](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2633), not a finalized universal standard. OAuth fields supported here are `clientId`, `scopes` (joined into OpenCode's scope string), and `redirectUri`. Native-only OAuth options can be configured in OpenCode's override entry.

The plugin expands `${env:NAME}` references from the OpenCode process environment in manifest values. It does not read `.env` files. Do not commit credentials to a manifest. For remote servers, OpenCode can manage OAuth using the manifest's OAuth client settings, or use a configured bearer token in headers. The project must supply any runtime and credentials its servers need.

Each manifest name receives a stable OpenCode server ID of the form `project_<sanitized-name>_<twelve-character-digest>`. The digest includes the absolute manifest directory and the original name, keeping native OAuth credentials separate across projects and worktrees. OpenCode stores those credentials globally by server ID. Moving a checkout changes its generated IDs and may require signing in again, but does not require updating configuration paths. Names that sanitize alike still differ. If OpenCode already has a native MCP entry under the original manifest name, that entry wins and the plugin does not add another connection. An existing entry under the generated ID can override generated settings; `enabled: false` can disable it. `project_mcp_status` reports the manifest names, runtime IDs, and current native connection states without exposing credentials.

Manifest `title` and `description` can provide optional model guidance through OpenCode's experimental `experimental.chat.system.transform` hook. MCP discovery and connections do not depend on that guidance.

## Distribution and development

This is an independent open-source OpenCode plugin. See [distribution details](MARKETPLACE.md) and [local exercise notes](TESTING.md). It is not listed in an official OpenCode marketplace.

The installation above was exercised with OpenCode 1.19.4 on macOS. It adds only the plugin entry to global configuration; project MCP declarations are read at runtime. The same command can be used after a machine rebuild.

The package exposes `dist/plugin.js` as its server entrypoint and has no runtime npm dependencies. The code is MIT licensed. [Third-party notices](THIRD_PARTY_NOTICES) accompany the bundled fictional example.
