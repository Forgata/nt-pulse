import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";

const currentDir = import.meta.dirname;

try {
  const packageJsonPath = path.resolve(currentDir, "../package.json");
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  const outputPath = path.join(currentDir, "../public/version.json");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  fs.writeFileSync(
    outputPath,
    JSON.stringify({ version: pkg.version }, null, 2),
  );

  execFileSync("git", ["add", outputPath]);

  console.log(
    `Synced v${pkg.version} to public/version.json and staged for Git.`,
  );
} catch (error: Error | any) {
  console.error("Failed to sync version:", error.message);
  process.exit(1);
}
