import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareHwpRuntime } from "./prepare-hwp-runtime.mjs";

const run = promisify(execFile);
const basePath = "/vendors/rust-hwp-intl/0.1.0/";
const sourceCommit = "1".repeat(40);
let projectDirectory: string;
let outputDirectory: string;
let fetchArchive: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const artifacts = new URL("../.artifacts/", import.meta.url);
  await mkdir(artifacts, { recursive: true });
  projectDirectory = await mkdtemp(
    resolve(artifacts.pathname, "hwp-runtime-test-"),
  );
  outputDirectory = resolve(projectDirectory, `public${basePath}`);
  fetchArchive = vi.fn(() => {
    throw new Error("Runtime preparation must work offline");
  });
  vi.stubGlobal("fetch", fetchArchive);
});
afterEach(async () => {
  await rm(projectDirectory, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function fixture(
  complete = true,
  buildId = "0.1.0",
  manifestBasePath = basePath,
  downstreamCommit = sourceCommit,
) {
  const source = resolve(projectDirectory, "fixture");
  await mkdir(resolve(source, "assets"), { recursive: true });
  await mkdir(resolve(source, "fonts"));
  await writeFile(resolve(source, "index.html"), "<html>HWP editor</html>");
  await writeFile(resolve(source, "assets/runtime.js"), "export {};");
  await writeFile(resolve(source, "fonts/font.woff2"), "fixture-font");
  await writeFile(resolve(source, "LICENSE"), "Apache-2.0");
  await writeFile(
    resolve(source, "THIRD_PARTY_LICENSES.md"),
    "Third-party notices",
  );
  await writeFile(resolve(source, "CanvasKit-LICENSE"), "CanvasKit notices");
  if (complete) {
    await writeFile(
      resolve(source, "runtime-manifest.json"),
      JSON.stringify({ buildId, basePath: manifestBasePath, downstreamCommit }),
    );
  }
  const packageDirectory = resolve(
    projectDirectory,
    "node_modules/rust-hwp-intl",
  );
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    resolve(packageDirectory, "package.json"),
    JSON.stringify({
      name: "rust-hwp-intl",
      version: "0.1.0",
      exports: { "./studio.tar.gz": "./studio.tar.gz" },
    }),
  );
  const archive = resolve(packageDirectory, "studio.tar.gz");
  await run("tar", ["-czf", archive, "-C", source, "."]);
  const bytes = await readFile(archive);
  const descriptor = {
    buildId: "0.1.0",
    basePath,
    source: "https://github.com/echovisionlab/rust-hwp-intl",
    sourceCommit,
    archivePackage: "rust-hwp-intl",
    archivePath: "studio.tar.gz",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  return { descriptor, archive };
}

async function expectCleanTemporaryDirectory() {
  expect(await readdir(resolve(projectDirectory, ".artifacts"))).toEqual([]);
}

describe("prepareHwpRuntime", () => {
  it("copies a verified installed package offline, reuses it, and repairs missing assets", async () => {
    const { descriptor } = await fixture();
    const prepared = await prepareHwpRuntime({ projectDirectory, descriptor });
    expect(prepared.reused).toBe(false);
    expect(
      await readFile(resolve(outputDirectory, "index.html"), "utf8"),
    ).toContain("HWP editor");
    await expectCleanTemporaryDirectory();

    const reused = await prepareHwpRuntime({ projectDirectory, descriptor });
    expect(reused.reused).toBe(true);

    await rm(resolve(outputDirectory, "assets/runtime.js"));
    const repaired = await prepareHwpRuntime({ projectDirectory, descriptor });
    expect(repaired.reused).toBe(false);
    expect(
      await readFile(resolve(outputDirectory, "assets/runtime.js"), "utf8"),
    ).toBe("export {};");
    expect(fetchArchive).not.toHaveBeenCalled();
    await expectCleanTemporaryDirectory();
  });

  it("rejects the wrong checksum without replacing existing public assets", async () => {
    const { descriptor } = await fixture();
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(resolve(outputDirectory, "index.html"), "existing runtime");
    descriptor.sha256 = "0".repeat(64);
    await expect(
      prepareHwpRuntime({ projectDirectory, descriptor }),
    ).rejects.toThrow("SHA256 mismatch");
    expect(await readFile(resolve(outputDirectory, "index.html"), "utf8")).toBe(
      "existing runtime",
    );
    await expectCleanTemporaryDirectory();
  });

  it.each([
    ["0.1.0-other", basePath, sourceCommit],
    ["0.1.0", "/wrong-base/", sourceCommit],
    ["0.1.0", basePath, "2".repeat(40)],
  ])(
    "rejects mismatched manifest pins %s %s %s",
    async (buildId, manifestBasePath, downstreamCommit) => {
      const { descriptor } = await fixture(
        true,
        buildId,
        manifestBasePath,
        downstreamCommit,
      );
      await expect(
        prepareHwpRuntime({ projectDirectory, descriptor }),
      ).rejects.toThrow("manifest does not match");
      await expectCleanTemporaryDirectory();
    },
  );

  it("rejects an incomplete verified archive and cleans up missing package archives", async () => {
    const { descriptor, archive } = await fixture(false);
    await expect(
      prepareHwpRuntime({ projectDirectory, descriptor }),
    ).rejects.toThrow();
    await expectCleanTemporaryDirectory();
    await rm(archive);
    await expect(
      prepareHwpRuntime({ projectDirectory, descriptor }),
    ).rejects.toThrow();
    await expectCleanTemporaryDirectory();
    expect(fetchArchive).not.toHaveBeenCalled();
  });

  it.each([
    "LICENSE",
    "THIRD_PARTY_LICENSES.md",
    "CanvasKit-LICENSE",
    "fonts/font.woff2",
  ])("repairs missing required runtime file %s", async (file) => {
    const { descriptor } = await fixture();
    await prepareHwpRuntime({ projectDirectory, descriptor });
    await rm(resolve(outputDirectory, file));
    expect(
      (await prepareHwpRuntime({ projectDirectory, descriptor })).reused,
    ).toBe(false);
    expect(
      (await readFile(resolve(outputDirectory, file))).byteLength,
    ).toBeGreaterThan(0);
    await expectCleanTemporaryDirectory();
  });

  it("rejects unfinished release pins before preparing assets", async () => {
    const { descriptor } = await fixture();
    descriptor.sha256 = "PENDING_FINAL_RELEASE_ARCHIVE_SHA256";
    await expect(
      prepareHwpRuntime({ projectDirectory, descriptor }),
    ).rejects.toThrow("published archive SHA256");
    descriptor.sha256 = "0".repeat(64);
    descriptor.sourceCommit = "PENDING_FINAL_RELEASE_SOURCE_COMMIT";
    await expect(
      prepareHwpRuntime({ projectDirectory, descriptor }),
    ).rejects.toThrow("published source commit");
    await expect(
      readdir(resolve(projectDirectory, ".artifacts")),
    ).rejects.toThrow();
  });
});
