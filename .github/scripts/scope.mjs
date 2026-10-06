import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const tools = ["transcode", "youtube-audio", "hwp", "portadj"];
const [base, head] = process.argv.slice(2);
const paths = base
  ? execFileSync("git", ["diff", "--name-only", base, head], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean)
  : ["package.json"];
const selected = new Set();
for (const path of paths) {
  if (
    path === "package.json" &&
    base &&
    (process.env.RELEASE_TAG ||
      process.env.HEAD_REF?.startsWith("release-please--"))
  ) {
    const read = (revision) => {
      const pkg = JSON.parse(
        execFileSync("git", ["show", `${revision}:package.json`], {
          encoding: "utf8",
        }),
      );
      delete pkg.version;
      return JSON.stringify(pkg);
    };
    if (read(base) === read(head)) continue;
  }
  const match = /^apps\/([^/]+)\//.exec(path);
  if (match && tools.includes(match[1])) selected.add(match[1]);
  else if (
    !/^(docs\/|CHANGELOG\.md$|\.release-please-manifest\.json$|release-please-config\.json$)/.test(
      path,
    )
  ) {
    tools.forEach((tool) => selected.add(tool));
  }
}
const matrix = { tool: tools.filter((tool) => selected.has(tool)) };
const output = `matrix=${JSON.stringify(matrix)}\nrun_checks=${matrix.tool.length > 0}\n`;
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, output);
else process.stdout.write(output);
