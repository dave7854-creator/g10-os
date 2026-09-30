// g10-builder/safety.js
//
// Single home for every safety control in the Builder pipeline.
// builder.js (proposal) and jobs.js (web approval + apply) both import from
// here so the controls cannot drift apart. Nothing here was weakened in the
// Phase 1 refactor — the protected-files list only gained g10-builder/backups/.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BUILDER_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveProjectRoot() {
  const override = process.env.BUILDER_PROJECT_ROOT;
  if (override) {
    const full = path.resolve(override);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
      throw new Error(`BUILDER_PROJECT_ROOT is not a directory: ${override}`);
    }
    return full;
  }
  return path.resolve(BUILDER_DIR, "..");
}

export const PROJECT_ROOT = resolveProjectRoot();
export const BACKUP_ROOT = path.join(BUILDER_DIR, "backups");

export function normalize(p) {
  return p.replaceAll("\\", "/");
}

// Files the Builder may never write, no matter what a model proposes.
function isProtectedFile(relativePath) {
  const p = normalize(relativePath);
  if (p.includes(".env")) return true;
  if (p.endsWith("package-lock.json")) return true;
  if (p === "g10-builder/g10-knowledge.json") return true;
  if (p === "g10-builder/backups" || p.startsWith("g10-builder/backups/")) return true;
  return false;
}

// Path guard: every write stays inside the project root.
export function safePath(relativePath) {
  const full = path.resolve(PROJECT_ROOT, relativePath);

  if (!full.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error(`Unsafe path blocked: ${relativePath}`);
  }

  return full;
}

export function readFile(relativePath) {
  const full = safePath(relativePath);

  if (!fs.existsSync(full)) return null;

  return fs.readFileSync(full, "utf8");
}

export function makeDiff(oldText, newText) {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);

  let start = 0;

  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;

  while (
    oldEnd >= start &&
    newEnd >= start &&
    oldLines[oldEnd] === newLines[newEnd]
  ) {
    oldEnd--;
    newEnd--;
  }

  if (
    start === oldLines.length &&
    start === newLines.length
  ) {
    return "NO DIFFERENCE";
  }

  const before = Math.max(0, start - 3);
  const oldAfter = Math.min(oldLines.length - 1, oldEnd + 3);

  let output = "";

  for (let i = before; i < start; i++) {
    output += `  ${oldLines[i]}\n`;
  }

  for (let i = start; i <= oldEnd; i++) {
    output += `- ${oldLines[i]}\n`;
  }

  for (let i = start; i <= newEnd; i++) {
    output += `+ ${newLines[i]}\n`;
  }

  for (let i = oldEnd + 1; i <= oldAfter; i++) {
    if (i >= 0 && i < oldLines.length) {
      output += `  ${oldLines[i]}\n`;
    }
  }

  return output;
}

// Rejects anything the model was not allowed to propose.
export function validateChanges(changes, allowedFiles) {
  for (const change of changes) {
    if (!allowedFiles.includes(change.file)) {
      throw new Error(
        `Blocked unauthorized change: ${change.file}`
      );
    }

    if (isProtectedFile(change.file)) {
      throw new Error(
        `Protected file blocked: ${change.file}`
      );
    }

    if (typeof change.content !== "string") {
      throw new Error(
        `Invalid content: ${change.file}`
      );
    }

    if (
      change.content.includes("Apply the following replacements") ||
      change.content.includes("replacement instructions:") ||
      change.content.includes("Replace the following code") ||
      change.content.includes("replace:") ||
      change.content.includes("with:")
    ) {
      throw new Error(
        `Patch instructions blocked: ${change.file}`
      );
    }

    const original = readFile(change.file);

    if (original === null) {
      throw new Error(
        `Missing source file: ${change.file}`
      );
    }

    if (original === change.content) {
      throw new Error(
        `No actual change: ${change.file}`
      );
    }
  }
}

export function showDiffs(changes) {
  console.log("\n====================================");
  console.log("             EXACT DIFF");
  console.log("====================================");

  for (const change of changes) {
    console.log(`\nFILE: ${change.file}`);
    console.log("------------------------------------");

    console.log(
      makeDiff(
        readFile(change.file),
        change.content
      )
    );
  }
}

// Backup BEFORE anything is written. Returns the backup directory.
export function createBackup(changes) {
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");

  const backupDir = path.join(
    BACKUP_ROOT,
    stamp
  );

  fs.mkdirSync(backupDir, {
    recursive: true
  });

  for (const change of changes) {
    const source = safePath(change.file);
    const destination = path.join(
      backupDir,
      change.file
    );

    fs.mkdirSync(path.dirname(destination), {
      recursive: true
    });

    fs.copyFileSync(source, destination);
  }

  return backupDir;
}

export function applyChanges(changes) {
  for (const change of changes) {
    fs.writeFileSync(
      safePath(change.file),
      change.content,
      "utf8"
    );
  }
}

export function restoreBackup(changes, backupDir) {
  for (const change of changes) {
    const backup = path.join(
      backupDir,
      change.file
    );

    if (fs.existsSync(backup)) {
      fs.copyFileSync(
        backup,
        safePath(change.file)
      );
    }
  }
}

// Build verification. Throws on failure or timeout so callers can roll back.
export function runBuild() {
  console.log("\nRunning build test...\n");

  try {
    execSync("npm run build", {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      timeout: 120000,
      windowsHide: true
    });

    console.log("\nBuild test passed.");
  } catch (error) {
    if (
      error.killed ||
      error.signal === "SIGTERM" ||
      error.code === "ETIMEDOUT"
    ) {
      throw new Error(
        "Build test timed out after 120 seconds."
      );
    }

    throw error;
  }
}
