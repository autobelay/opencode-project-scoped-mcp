import { loadProject, applyProject, VERSION } from "./project.mjs";

// A single plugin export. No runtime dependencies, process spawning or config writes.
export default async function LocalProjectMcp({ directory, client }) {
  let project = { manifest: null, root: null, servers: {} },
    records = [],
    error;
  return {
    config: async (config) => {
      try {
        project = await loadProject(directory);
        records = applyProject(config, project);
        error = undefined;
      } catch {
        error =
          "Could not read the project manifest. Check the project directory, mcp.json syntax and server definitions.";
        records = [];
      }
    },
    tool: {
      project_mcp_status: {
        description:
          "Local Project MCP: report the nearest project mcp.json and its native local and remote OpenCode MCP connection states. Does not return credentials, launch arguments or raw connection errors.",
        args: {},
        execute: async () => {
          let states = {},
            statusError;
          try {
            const response = await client.mcp.status({ query: { directory } });
            if (response.error) throw new Error("status");
            states = response.data ?? {};
          } catch {
            statusError = "Native MCP status is temporarily unavailable.";
          }
          return {
            title: "Local Project MCP · Status",
            output: JSON.stringify({
              version: VERSION,
              manifest: project.manifest,
              projectRoot: project.root,
              ...(error ? { error } : {}),
              ...(statusError ? { statusError } : {}),
              servers: records.map((r) => ({
                name: r.name,
                runtimeId: r.runtimeId,
                source: r.source,
                status: r.error
                  ? "invalid"
                  : (states[r.runtimeId]?.status ?? "unknown"),
                ...(r.error ? { error: r.error } : {}),
              })),
            }),
          };
        },
      },
    },
    "experimental.chat.system.transform": async (_input, output) => {
      if (!records.length) return;
      const lines = [
        "Local Project MCP: connection descriptions from this project's mcp.json:",
      ];
      for (const r of records)
        if (!r.error)
          lines.push(
            `- ${r.name} (OpenCode server: ${r.runtimeId})${r.title ? ` — ${r.title}` : ""}${r.description ? `: ${r.description}` : ""}`,
          );
      output.system.push(lines.join("\n"));
    },
  };
}
