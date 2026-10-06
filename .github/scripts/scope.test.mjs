import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./scope.mjs", import.meta.url));
test("release scope preserves independent app delivery and metadata skips", () => {
  const directory = mkdtempSync(
    path.join(path.dirname(script), ".scope-test-"),
  );
  const git = (...args) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "user.name=Scope Test",
      "-c",
      "user.email=scope@example.invalid",
      "commit",
      "-qm",
      "fix: fixture",
    );
    return git("rev-parse", "HEAD");
  };
  const classify = (base, head) => {
    const result = execFileSync(process.execPath, [script, base, head], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: "",
        HEAD_REF: "",
        RELEASE_TAG: "v0.2.0",
      },
    });
    return JSON.parse(result.split("\n")[0].slice("matrix=".length)).tool;
  };
  try {
    git("init", "-q", "-b", "main");
    writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ version: "0.1.0", dependencies: { example: "1.0.0" } }),
    );
    const base = commit();
    assert.equal(classify("", base).length, 4);
    mkdirSync(path.join(directory, "apps/hwp"), { recursive: true });
    writeFileSync(
      path.join(directory, "apps/hwp/index.ts"),
      "export const hwp = true;",
    );
    const app = commit();
    assert.deepEqual(classify(base, app), ["hwp"]);
    writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ version: "0.2.0", dependencies: { example: "1.0.0" } }),
    );
    writeFileSync(path.join(directory, "CHANGELOG.md"), "release notes");
    const metadata = commit();
    assert.deepEqual(classify(app, metadata), []);
    assert.deepEqual(classify(base, metadata), ["hwp"]);
    writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ version: "0.2.0", dependencies: { example: "2.0.0" } }),
    );
    assert.equal(classify(metadata, commit()).length, 4);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
