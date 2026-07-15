import { readFileSync, writeFileSync, chmodSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const bin = resolve("dist/cli/index.js");
const src = readFileSync(bin, "utf8");
const shebang = "#!/usr/bin/env node\n";
if (!src.startsWith(shebang)) {
  writeFileSync(bin, shebang + src);
}
chmodSync(bin, 0o755);
console.log("prepared", bin);

const rootLicense = resolve("../../LICENSE");
const packageLicense = resolve("LICENSE");
copyFileSync(rootLicense, packageLicense);
console.log("copied", rootLicense, "->", packageLicense);
