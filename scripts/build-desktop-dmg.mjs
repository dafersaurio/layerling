import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const exportDir = path.join(repositoryRoot, "apps", "web", ".next-export");
const desktopDir = path.join(repositoryRoot, "desktop");
const desktopWebDir = path.join(desktopDir, "web");
const distDir = path.join(repositoryRoot, "dist");

console.log("==> Building Layerling Desktop DMG...");

// 1. Build web static export if not already present
if (!fs.existsSync(path.join(exportDir, "index.html"))) {
  console.log("==> Generating static web export...");
  execSync("npm run export", { cwd: repositoryRoot, stdio: "inherit" });
}

// 2. Prepare desktop/web directory
console.log("==> Syncing static assets to desktop package...");
fs.rmSync(desktopWebDir, { recursive: true, force: true });
fs.mkdirSync(desktopWebDir, { recursive: true });
execSync(`cp -R "${exportDir}"/* "${desktopWebDir}/"`, { stdio: "inherit" });

// 3. Ensure desktop dependencies are installed
if (!fs.existsSync(path.join(desktopDir, "node_modules"))) {
  console.log("==> Installing desktop electron dependencies...");
  execSync("npm install", { cwd: desktopDir, stdio: "inherit" });
}

// 4. Build DMG with electron-builder
console.log("==> Packaging native macOS DMG installer...");
execSync("npm run build:dmg", { cwd: desktopDir, stdio: "inherit" });

// 5. Copy DMG to root dist/
fs.mkdirSync(distDir, { recursive: true });
const desktopDist = path.join(desktopDir, "dist");
const dmgFiles = fs.readdirSync(desktopDist).filter((f) => f.endsWith(".dmg"));
if (dmgFiles.length > 0) {
  const dmgSource = path.join(desktopDist, dmgFiles[0]);
  const dmgTarget = path.join(distDir, "Layerling.dmg");
  fs.copyFileSync(dmgSource, dmgTarget);
  console.log(`\n🎉 Success! DMG is ready at:\n   ${dmgTarget}`);
}
