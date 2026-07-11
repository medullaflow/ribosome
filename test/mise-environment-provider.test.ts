// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: © 2026 ribosome contributors

// Integration test against a REAL mise install (see Phase 1 acceptance
// criteria in ROADMAP.md) — no mocking of the mise CLI. Skips itself if mise
// isn't on PATH, so `npm test` stays green in environments without it (CI
// should install mise; see .github/workflows/ci.yml).
//
// Uses jq (small, fast) and node (the tool every manifest example in this
// project actually uses) so the "pathPrepend resolves the right binary"
// acceptance criterion is checked against a real interpreter, not just a
// trivial CLI.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { MiseEnvironmentProvider } from "../dist/index.js";
import { withMiseInstallLock } from "./mise-install-lock";

function hasMise(): boolean {
  try {
    execFileSync("mise", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const skip = !hasMise();
// Generous: withMiseInstallLock (see ./mise-install-lock.ts) can make this
// test queue behind a sibling test FILE's own cold install (a real download +
// extract + attestation check, empirically ~50s each) before it even starts
// its own real work.
const testOpts = { skip: skip ? "mise not found on PATH" : false, timeout: 180000 };

test("materialize() installs and dedups by exact resolved version", testOpts, async () => {
  const provider = new MiseEnvironmentProvider();
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-mise-test-"));

  const pool = await withMiseInstallLock(() =>
    provider.materialize(
      [
        { tool: "jq", versionSpec: "latest" },
        { tool: "node", versionSpec: "22" },
        { tool: "node", versionSpec: "22.23" }, // different spec, same tool family
      ],
      { cwd },
    ),
  );

  const jq = pool.find((p) => p.tool === "jq");
  const nodeEntries = pool.filter((p) => p.tool === "node");

  assert.ok(jq, "jq should be in the pool");
  assert.match(jq.version, /^\d+\.\d+\.\d+$/, "jq version should be a concrete semver");
  assert.equal(jq.id, `jq@${jq.version}`);

  // "22" and "22.23" should both resolve to the SAME installed node -> one pool entry.
  assert.equal(nodeEntries.length, 1, "node@22 and node@22.23 should dedup to one pool entry");
  assert.match(
    nodeEntries[0]?.version ?? "",
    /^22\./,
    "resolved node version should be a 22.x patch",
  );
});

test(
  "materialize() registers every resolved tool with mise's own tracked-configs, so it isn't left prunable (#59)",
  testOpts,
  async () => {
    const provider = new MiseEnvironmentProvider();
    const cwd = mkdtempSync(join(tmpdir(), "ribosome-mise-test-"));

    const pool = await withMiseInstallLock(() =>
      provider.materialize([{ tool: "jq", versionSpec: "latest" }], { cwd }),
    );
    const jq = pool[0];
    assert.ok(jq);

    // Adapter-internal, project-local tracked config (never the project
    // root -- see the adapter's own module comment).
    const tracked = readFileSync(join(cwd, ".ribosome", "mise.toml"), "utf8");
    assert.match(tracked, new RegExp(`jq = "${jq.version}"`));

    // The actual acceptance criterion: a bare `mise install` (this
    // adapter's pre-#59 behavior) left an install immediately visible to
    // `mise ls --prunable` -- an unrelated `mise prune` elsewhere on the
    // machine could silently delete it. It must not be listed now.
    const prunable = execFileSync("mise", ["ls", "--prunable"], { encoding: "utf8" });
    assert.ok(
      !new RegExp(`^jq\\s+${jq.version}\\s*$`, "m").test(prunable),
      `jq@${jq.version} should not be prunable after materialize() tracked it, got:\n${prunable}`,
    );
  },
);

test("composeView() produces a pathPrepend that resolves the right binary", testOpts, async () => {
  const provider = new MiseEnvironmentProvider();
  const cwd = mkdtempSync(join(tmpdir(), "ribosome-mise-test-"));

  const pool = await withMiseInstallLock(() =>
    provider.materialize([{ tool: "node", versionSpec: "22" }], { cwd }),
  );
  const node = pool[0];
  assert.ok(node);

  const view = provider.composeView(pool, [node.id]);
  assert.ok(view.pathPrepend.length > 0, "pathPrepend should not be empty");
  assert.deepEqual(view.envVars, {});

  // The acceptance criterion, literally: PATH built from pathPrepend must
  // resolve `node --version` to the exact version mise reported.
  const version = execFileSync("node", ["--version"], {
    env: { ...process.env, PATH: `${view.pathPrepend.join(":")}:${process.env.PATH}` },
    encoding: "utf8",
  }).trim();
  assert.equal(version, `v${node.version}`);
});

test("composeView() throws for a pool id it never materialized", testOpts, () => {
  const provider = new MiseEnvironmentProvider();
  assert.throws(
    () =>
      provider.composeView(
        [{ id: "node@1.2.3", tool: "node", requested: "1", version: "1.2.3" }],
        ["node@1.2.3"],
      ),
    /no cached bin paths/,
  );
});

test(
  "materialize() aggregates failures instead of throwing on the first one",
  testOpts,
  async () => {
    const provider = new MiseEnvironmentProvider();
    const cwd = mkdtempSync(join(tmpdir(), "ribosome-mise-test-"));

    await assert.rejects(
      provider.materialize(
        [
          { tool: "totally-not-a-real-tool-xyz", versionSpec: "1" },
          { tool: "also-not-real-abc", versionSpec: "1" },
        ],
        { cwd },
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /totally-not-a-real-tool-xyz/);
        assert.match(err.message, /also-not-real-abc/);
        return true;
      },
    );
  },
);

test(
  "prune() removes an untracked install but leaves a materialize()-tracked one alone (#61)",
  testOpts,
  async () => {
    const provider = new MiseEnvironmentProvider();
    const cwd = mkdtempSync(join(tmpdir(), "ribosome-mise-test-"));
    // Isolated pool dir: prune() is destructive, so this test must never
    // touch the machine's real default mise store.
    const poolDir = mkdtempSync(join(tmpdir(), "ribosome-mise-pool-"));

    // A tracked install, via the adapter itself -- must survive pruning.
    // Pinned to a specific, unusual old version (not "latest"/fuzzy): mise's
    // tracked-configs protection is NOT scoped per MISE_DATA_DIR -- it's
    // global by exact tool@version identity (verified) -- so reusing
    // whatever version another test in this same file resolves+tracks (e.g.
    // "latest") would make this test's "untracked" half accidentally
    // inherit that unrelated protection.
    const [kept] = await withMiseInstallLock(() =>
      provider.materialize([{ tool: "jq", versionSpec: "1.6" }], { cwd, poolDir }),
    );
    assert.ok(kept);
    assert.equal(kept.version, "1.6");

    // An untracked install of a DIFFERENT exact version of the same tool, in
    // the same pool, bypassing the adapter (bare `mise install`, exactly the
    // pre-#59 gap) -- must be removed.
    await withMiseInstallLock(() =>
      execFileSync("mise", ["install", "jq@1.7"], {
        cwd,
        env: { ...process.env, MISE_DATA_DIR: poolDir },
      }),
    );

    // Dry run first: reports the untracked entry, removes nothing.
    const dryRun = await provider.prune({ cwd, poolDir }, { dryRun: true });
    assert.ok(
      dryRun.pruned.some((p) => p.tool === "jq" && p.version === "1.7"),
      `dry run should report jq@1.7 as prunable, got: ${JSON.stringify(dryRun.pruned)}`,
    );
    assert.ok(
      !dryRun.pruned.some((p) => p.version === "1.6"),
      "dry run should not report the tracked jq@1.6 install as prunable",
    );
    const stillThere = execFileSync("mise", ["where", "jq@1.7"], {
      cwd,
      env: { ...process.env, MISE_DATA_DIR: poolDir },
      encoding: "utf8",
    }).trim();
    assert.ok(stillThere.startsWith(poolDir), "dry run must not have actually removed jq@1.7");

    // Real run: removes jq@1.7, leaves jq@1.6's tracked install alone.
    const real = await provider.prune({ cwd, poolDir }, { dryRun: false });
    assert.ok(real.pruned.some((p) => p.tool === "jq" && p.version === "1.7"));

    assert.throws(
      () =>
        execFileSync("mise", ["where", "jq@1.7"], {
          cwd,
          env: { ...process.env, MISE_DATA_DIR: poolDir },
          stdio: "pipe",
        }),
      /./,
      "jq@1.7 should actually be gone after a real (non-dry-run) prune",
    );
    const jqStillThere = execFileSync("mise", ["where", `jq@${kept.version}`], {
      cwd,
      env: { ...process.env, MISE_DATA_DIR: poolDir },
      encoding: "utf8",
    }).trim();
    assert.ok(jqStillThere.startsWith(poolDir), "the tracked jq@1.6 install must survive pruning");
  },
);

test(
  "materialize() honors ctx.poolDir, physically isolating installs from the default shared store (#60)",
  testOpts,
  async () => {
    const provider = new MiseEnvironmentProvider();
    const cwd = mkdtempSync(join(tmpdir(), "ribosome-mise-test-"));
    const poolDir = mkdtempSync(join(tmpdir(), "ribosome-mise-pool-"));

    const pool = await withMiseInstallLock(() =>
      provider.materialize([{ tool: "jq", versionSpec: "latest" }], { cwd, poolDir }),
    );
    const jq = pool[0];
    assert.ok(jq);

    // The install must physically land under the custom pool dir, not
    // mise's own default global store.
    const view = provider.composeView(pool, [jq.id]);
    assert.ok(
      view.pathPrepend.every((p) => p.startsWith(poolDir)),
      `pathPrepend should be rooted under poolDir ${poolDir}, got: ${view.pathPrepend.join(", ")}`,
    );

    // The real acceptance criterion: mise itself, scoped to that same
    // directory, must independently agree the tool lives there.
    const misePath = execFileSync("mise", ["where", `jq@${jq.version}`], {
      cwd,
      env: { ...process.env, MISE_DATA_DIR: poolDir },
      encoding: "utf8",
    }).trim();
    assert.ok(misePath.startsWith(poolDir));
  },
);
