import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discover } from "../src/manifest.mjs";
import {
  projectServer,
  serverId,
  loadProject,
  applyProject,
} from "../src/project.mjs";
import Plugin from "../dist/plugin.js";
async function temp(t) {
  const p = await realpath(await mkdtemp(join(tmpdir(), "project-mcp-")));
  t.after(() => rm(p, { recursive: true, force: true }));
  return p;
}

test("discovery uses nearest manifest, stops at checkout/worktree and rejects missing directory", async (t) => {
  const p = await temp(t);
  await writeFile(join(p, "mcp.json"), "{}");
  await mkdir(join(p, "child", "nested"), { recursive: true });
  assert.equal(await discover(join(p, "child", "nested")), join(p, "mcp.json"));
  await writeFile(join(p, "child", ".git"), "gitdir: elsewhere");
  assert.equal(await discover(join(p, "child", "nested")), null);
  await writeFile(join(p, "child", "mcp.json"), "{}");
  assert.equal(
    await discover(join(p, "child", "nested")),
    join(p, "child", "mcp.json"),
  );
  await assert.rejects(discover(join(p, "missing")), /ENOENT/);
});
test("local projection preserves argv/env and resolves cwd to manifest root without mutating input", () => {
  const s = {
    type: "stdio",
    command: "node",
    args: ["tooling/server.mjs", "${env:ARG}"],
    env: { KEY: "prefix-${env:SECRET}" },
  };
  const p = projectServer(s, "/synthetic/project", {
    ARG: "value with spaces",
    SECRET: "synthetic",
  });
  assert.deepEqual(p, {
    type: "local",
    command: ["node", "tooling/server.mjs", "value with spaces"],
    cwd: "/synthetic/project",
    environment: { KEY: "prefix-synthetic" },
    enabled: true,
    timeout: 30000,
  });
  assert.equal(s.args[1], "${env:ARG}");
  assert.throws(() => projectServer(s, "/synthetic/project", {}), /Missing/);
});
test("remote projection retains native OAuth with scope translation and explicit headers", () => {
  for (const type of ["streamable-http", "sse"]) {
    assert.deepEqual(
      projectServer(
        {
          type,
          url: "https://example.test/mcp",
          headers: { Authorization: "Bearer ${env:TOKEN}" },
        },
        "/project",
        { TOKEN: "synthetic" },
      ),
      {
        type: "remote",
        url: "https://example.test/mcp",
        headers: { Authorization: "Bearer synthetic" },
        oauth: false,
        enabled: true,
        timeout: 30000,
      },
    );
  }
  assert.deepEqual(
    projectServer(
      {
        type: "streamable-http",
        url: "https://example.test/mcp",
        oauth: {
          clientId: "public-id",
          scopes: ["read", "list"],
          redirectUri: "http://localhost:5000/callback",
        },
      },
      "/project",
    ).oauth,
    {
      clientId: "public-id",
      scope: "read list",
      redirectUri: "http://localhost:5000/callback",
    },
  );
  assert.throws(
    () =>
      projectServer(
        { type: "streamable-http", url: "file:///secret" },
        "/project",
      ),
    /protocol/,
  );
  assert.throws(
    () =>
      projectServer(
        {
          type: "streamable-http",
          url: "https://example.test",
          oauth: { scopes: "read" },
        },
        "/project",
      ),
    /scopes/,
  );
});
test("native config wins and disabled generated entries are preserved, invalid sibling stays isolated", () => {
  const project = {
    root: "/a",
    servers: {
      design: { type: "stdio", command: "node", args: ["design.mjs"] },
      disabled: { type: "stdio", command: "node" },
      broken: { type: "stdio", command: "${env:MISSING}" },
    },
  };
  const config = {
    mcp: {
      personal: { type: "remote", url: "https://personal.test" },
      design: { type: "local", command: ["own-server"] },
      [serverId("disabled", "/a")]: { enabled: false },
    },
  };
  const records = applyProject(config, project, {});
  assert.deepEqual(config.mcp.design, {
    type: "local",
    command: ["own-server"],
  });
  assert.equal(config.mcp[serverId("disabled", "/a")].enabled, false);
  assert.equal(config.mcp[serverId("disabled", "/a")].cwd, "/a");
  assert.equal(config.mcp[serverId("broken", "/a")], undefined);
  assert.equal(records.find((r) => r.name === "design").source, "native");
  assert.ok(records.find((r) => r.name === "broken").error);
  assert.equal(config.mcp.personal.url, "https://personal.test");
});
test("runtime IDs distinguish projects, worktrees and names that normalize alike", () => {
  assert.notEqual(serverId("design", "/one"), serverId("design", "/two"));
  assert.notEqual(serverId("a-b", "/one"), serverId("a_b", "/one"));
  assert.equal(serverId("design", "/one"), serverId("design", "/one"));
});
test("bundled plugin status exposes no credentials or native errors and calls correct workspace", async (t) => {
  const p = await temp(t);
  await writeFile(
    join(p, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        design: {
          type: "stdio",
          command: "node",
          args: ["server.mjs", "synthetic-secret-arg"],
          env: { TOKEN: "synthetic-secret-env" },
          title: "Design",
          description: "Local tokens",
        },
      },
    }),
  );
  let query;
  const hooks = await Plugin({
    directory: p,
    client: {
      mcp: {
        status: async (opts) => {
          query = opts.query;
          return {
            data: {
              [serverId("design", p)]: {
                status: "failed",
                error: "synthetic-secret-error",
              },
            },
          };
        },
      },
    },
  });
  const config = {};
  await hooks.config(config);
  const text = await hooks.tool.project_mcp_status.execute({});
  assert.ok(!text.includes("synthetic-secret"));
  const status = JSON.parse(text);
  assert.equal(status.servers[0].status, "failed");
  assert.deepEqual(query, { directory: p });
  assert.equal(config.mcp[serverId("design", p)].cwd, p);
  const output = { system: [] };
  await hooks["experimental.chat.system.transform"]({}, output);
  assert.match(output.system[0], /Local tokens/);
});
test("independent project instances and no-manifest sessions do not share server config", async (t) => {
  const a = await temp(t),
    b = await temp(t);
  await writeFile(
    join(a, "mcp.json"),
    JSON.stringify({
      mcpServers: { design: { type: "stdio", command: "node" } },
    }),
  );
  const make = (directory) =>
    Plugin({
      directory,
      client: { mcp: { status: async () => ({ data: {} }) } },
    });
  const [ha, hb] = await Promise.all([make(a), make(b)]);
  const ca = {},
    cb = { mcp: { personal: { enabled: false } } };
  await Promise.all([ha.config(ca), hb.config(cb)]);
  assert.ok(ca.mcp[serverId("design", a)]);
  assert.deepEqual(cb, { mcp: { personal: { enabled: false } } });
  assert.equal(
    JSON.parse(await hb.tool.project_mcp_status.execute({})).manifest,
    null,
  );
});
test("malformed manifests report an error without echoing the file contents", async (t) => {
  const p = await temp(t);
  await writeFile(join(p, "mcp.json"), "synthetic-secret-not-json");
  const hooks = await Plugin({
    directory: p,
    client: { mcp: { status: async () => ({ data: {} }) } },
  });
  const config = {};
  await hooks.config(config);
  const result = await hooks.tool.project_mcp_status.execute({});
  assert.ok(JSON.parse(result).error);
  assert.ok(!result.includes("synthetic-secret"));
  assert.deepEqual(config, {});
});

test('projection does not mutate an MCP map shared with another workspace',()=>{
 const shared={personal:{type:'remote',url:'https://personal.test'}};
 const first={mcp:shared}, second={mcp:shared};
 applyProject(first,{root:'/first',servers:{design:{type:'stdio',command:'node'}}});
 assert.deepEqual(Object.keys(second.mcp),['personal']);
 assert.notEqual(first.mcp,second.mcp);
});
