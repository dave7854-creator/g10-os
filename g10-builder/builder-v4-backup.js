import "dotenv/config";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import readline from "readline";
import { execSync } from "child_process";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROJECT_ROOT = path.resolve("..");
const BACKUP_ROOT = path.resolve("./backups");

const ALLOWED = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".sql", ".css", ".html"
]);

const IGNORED = new Set([
  "node_modules", "dist", ".git", ".bolt", "g10-builder"
]);

const MAX_FILES = 10;
const MAX_FILE_CHARS = 80000;
const MAX_TOTAL_CHARS = 300000;

function normalize(p) {
  return p.replaceAll("\\", "/");
}

function scan(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scan(full, results);
    } else if (ALLOWED.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function safePath(relativePath) {
  const full = path.resolve(PROJECT_ROOT, relativePath);

  if (!full.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error(`Unsafe path blocked: ${relativePath}`);
  }

  return full;
}

function readFile(relativePath) {
  const full = safePath(relativePath);

  if (!fs.existsSync(full)) return null;

  return fs.readFileSync(full, "utf8");
}

function parseJSON(text) {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start < 0 || end < 0) {
    throw new Error("Model did not return valid JSON.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function buildContext(paths) {
  let total = 0;
  let context = "";

  for (const file of paths) {
    let content = readFile(file);
    if (content === null) continue;

    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS);
    }

    if (total + content.length > MAX_TOTAL_CHARS) break;

    total += content.length;

    context += `
==================================================
FILE: ${file}
==================================================
${content}
`;
  }

  return context;
}

async function locate(request, fileMap) {
  console.log("\n[1/3] Luna is locating relevant code...");

  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    reasoning: { effort: "none" },

    input: `
You are the file locator for G10 Builder.

USER REQUEST:
${request}

PROJECT FILES:
${fileMap.join("\n")}

Trace the complete implementation path.

Return ONLY JSON:

{
  "files": ["exact/path"]
}

Maximum ${MAX_FILES} files.
Only return paths from PROJECT FILES.
Prefer current implementation files.
`
  });

  return parseJSON(response.output_text);
}

async function propose(request, files) {
  console.log("[2/3] Terra is analyzing and preparing a patch...");

  const context = buildContext(files);

  const response = await openai.responses.create({
    model: "gpt-5.6-terra",
    reasoning: { effort: "medium" },

    input: `
You are the coding stage of G10 Builder.

USER REQUEST:
${request}

ACTUAL PROJECT CODE:
${context}

Prepare the SMALLEST safe change necessary.

IMPORTANT RULES:

- Modify only files shown above.
- Preserve unrelated functionality.
- Never invent database columns or APIs.
- Never expose secrets.
- Never modify .env files.
- Never modify package-lock.json.
- Return COMPLETE replacement contents for every file you change.
- If there is not enough information for a safe change, do NOT guess.

Return ONLY valid JSON:

{
  "status": "READY",
  "summary": "what is wrong and what will change",
  "changes": [
    {
      "file": "exact/path",
      "content": "COMPLETE replacement file contents"
    }
  ]
}

If a safe fix cannot be made:

{
  "status": "NEED_MORE_INFO",
  "summary": "explain exactly what is missing",
  "changes": []
}
`
  });

  return parseJSON(response.output_text);
}

function createBackup(changes) {
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");

  const backupDir = path.join(BACKUP_ROOT, stamp);

  fs.mkdirSync(backupDir, { recursive: true });

  for (const change of changes) {
    const source = safePath(change.file);

    if (!fs.existsSync(source)) {
      throw new Error(`Cannot backup missing file: ${change.file}`);
    }

    const destination = path.join(backupDir, change.file);

    fs.mkdirSync(path.dirname(destination), {
      recursive: true
    });

    fs.copyFileSync(source, destination);
  }

  return backupDir;
}

function applyChanges(changes) {
  for (const change of changes) {
    const target = safePath(change.file);

    fs.writeFileSync(
      target,
      change.content,
      "utf8"
    );
  }
}

function restoreBackup(changes, backupDir) {
  for (const change of changes) {
    const backup = path.join(
      backupDir,
      change.file
    );

    const target = safePath(change.file);

    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, target);
    }
  }
}

function runBuild() {
  console.log("\n[3/3] Running G10 OS build test...\n");

  execSync("npm run build", {
    cwd: PROJECT_ROOT,
    stdio: "inherit"
  });
}

async function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\n====================================");
  console.log("          G10 BUILDER v4");
  console.log("====================================");
  console.log("AI edits require explicit approval.");
  console.log("Backup + build rollback enabled.\n");

  const allFiles = scan(PROJECT_ROOT);

  const fileMap = allFiles.map(file =>
    normalize(path.relative(PROJECT_ROOT, file))
  );

  const request = await ask(
    "What do you want to change? "
  );

  try {
    const selection = await locate(
      request,
      fileMap
    );

    const selected = (selection.files || [])
      .filter(file => fileMap.includes(file))
      .slice(0, MAX_FILES);

    if (!selected.length) {
      throw new Error(
        "No relevant project files were selected."
      );
    }

    console.log("\nFiles being analyzed:");

    selected.forEach(file =>
      console.log(`  • ${file}`)
    );

    const proposal = await propose(
      request,
      selected
    );

    console.log("\n====================================");
    console.log("          PROPOSED CHANGE");
    console.log("====================================\n");

    console.log(proposal.summary);

    if (
      proposal.status !== "READY" ||
      !proposal.changes?.length
    ) {
      console.log(
        "\nNo files were changed."
      );
      return;
    }

    console.log("\nFiles Terra wants to modify:");

    proposal.changes.forEach(change =>
      console.log(`  • ${change.file}`)
    );

    // Reject files Terra wasn't given.
    for (const change of proposal.changes) {
      if (!selected.includes(change.file)) {
        throw new Error(
          `AI attempted unauthorized file change: ${change.file}`
        );
      }
    }

    const approval = await ask(
      '\nType YES to backup, apply and test these changes: '
    );

    if (approval !== "YES") {
      console.log(
        "\nCancelled. Nothing was changed."
      );
      return;
    }

    const backupDir = createBackup(
      proposal.changes
    );

    console.log(
      `\nBackup created:\n${backupDir}`
    );

    applyChanges(proposal.changes);

    console.log(
      "\nChanges applied locally."
    );

    try {
      runBuild();

      console.log("\n====================================");
      console.log("BUILD PASSED");
      console.log("Changes kept.");
      console.log("====================================\n");

    } catch {
      console.log("\nBUILD FAILED.");
      console.log("Restoring original files...");

      restoreBackup(
        proposal.changes,
        backupDir
      );

      console.log("\n====================================");
      console.log("ROLLBACK COMPLETE");
      console.log("Original files restored.");
      console.log("====================================\n");
    }

  } catch (error) {
    console.error(
      "\nG10 Builder error:",
      error.message
    );
  }
}

main();