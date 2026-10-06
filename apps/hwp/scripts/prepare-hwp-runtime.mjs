import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const basePath = "/vendors/rust-hwp-intl/0.2.1/";
const markerName = ".prepared.json";

async function checkReady(directory, runtime) {
  for (const name of [
    "index.html",
    "LICENSE",
    "THIRD_PARTY_LICENSES.md",
    "CanvasKit-LICENSE",
    "runtime-manifest.json",
    "component/index.js",
    "component/styles.css",
  ]) {
    const entry = await stat(resolve(directory, name));
    if (!entry.isFile() || entry.size === 0) {
      throw new Error(`RHWP runtime is missing ${name}`);
    }
  }
  const manifest = JSON.parse(
    await readFile(resolve(directory, "runtime-manifest.json"), "utf8"),
  );
  if (
    manifest.buildId !== runtime.buildId ||
    manifest.basePath !== runtime.basePath
  ) {
    throw new Error(
      "RHWP runtime manifest does not match the pinned build ID and base path.",
    );
  }
  if (manifest.downstreamCommit !== runtime.sourceCommit) {
    throw new Error(
      "HWP runtime manifest does not match the pinned source commit.",
    );
  }
  for (const name of ["assets", "fonts"]) {
    if ((await readdir(resolve(directory, name))).length === 0) {
      throw new Error(`RHWP runtime has an empty ${name} directory`);
    }
  }
}

/**
 * @param {{ projectDirectory?: string, descriptor?: {
 *   buildId: string, basePath: string, sourceCommit: string, sha256: string,
 *   archivePackage: string, archivePath: string
 * } }} [options]
 */
export async function prepareHwpRuntime({
  projectDirectory = fileURLToPath(new URL("../", import.meta.url)),
  descriptor,
} = {}) {
  const runtime =
    descriptor ??
    JSON.parse(
      await readFile(new URL("./hwp-runtime.json", import.meta.url), "utf8"),
    );
  if (!/^[a-f0-9]{64}$/.test(runtime.sha256 ?? "")) {
    throw new Error(
      "RHWP runtime descriptor requires the published archive SHA256.",
    );
  }
  if (runtime.basePath !== basePath) {
    throw new Error(`RHWP runtime must use ${basePath}`);
  }
  if (!/^[a-f0-9]{40}$/.test(runtime.sourceCommit ?? "")) {
    throw new Error(
      "HWP runtime descriptor requires the published source commit.",
    );
  }
  const outputDirectory = resolve(projectDirectory, `public${basePath}`);
  const marker = {
    sha256: runtime.sha256,
    buildId: runtime.buildId,
    sourceCommit: runtime.sourceCommit,
    archivePackage: runtime.archivePackage,
    archivePath: runtime.archivePath,
  };
  try {
    const prepared = JSON.parse(
      await readFile(resolve(outputDirectory, markerName), "utf8"),
    );
    if (JSON.stringify(prepared) === JSON.stringify(marker)) {
      await checkReady(outputDirectory, runtime);
      return { outputDirectory, reused: true };
    }
  } catch {
    // Missing or incomplete local assets are prepared again from the installed package.
  }

  const artifactsDirectory = resolve(projectDirectory, ".artifacts");
  await mkdir(artifactsDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(
    resolve(artifactsDirectory, "hwp-runtime-"),
  );
  try {
    const archive = resolve(temporaryDirectory, "runtime.tar.gz");
    const require = createRequire(resolve(projectDirectory, "package.json"));
    const installedArchive = require.resolve(
      `${runtime.archivePackage}/${runtime.archivePath}`,
    );
    await pipeline(
      createReadStream(installedArchive),
      createWriteStream(archive),
    );
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(archive)) {
      digest.update(chunk);
    }
    if (digest.digest("hex") !== runtime.sha256) {
      throw new Error("RHWP runtime archive SHA256 mismatch.");
    }

    // The verified package is trusted; also reject unsafe archive member paths before tar extraction.
    const { stdout } = await run("tar", ["-tzf", archive]);
    const members = stdout.trim().split("\n");
    if (
      members.some(
        (name) => name.startsWith("/") || name.split("/").includes(".."),
      )
    ) {
      throw new Error("RHWP runtime archive contains an unsafe member path.");
    }
    const stagedDirectory = resolve(temporaryDirectory, "runtime");
    await mkdir(stagedDirectory);
    await run("tar", ["-xzf", archive, "-C", stagedDirectory]);
    await checkReady(stagedDirectory, runtime);
    await writeFile(
      resolve(stagedDirectory, markerName),
      `${JSON.stringify(marker)}\n`,
    );
    await mkdir(dirname(outputDirectory), { recursive: true });
    const previousDirectory = resolve(temporaryDirectory, "previous");
    let movedPrevious = false;
    try {
      await rename(outputDirectory, previousDirectory);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    try {
      await rename(stagedDirectory, outputDirectory);
    } catch (error) {
      if (movedPrevious) {
        await rename(previousDirectory, outputDirectory);
      }
      throw error;
    }
    return { outputDirectory, reused: false };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = await prepareHwpRuntime();
  console.log(
    `RHWP runtime ${result.reused ? "reused" : "prepared"} at ${result.outputDirectory}`,
  );
}
