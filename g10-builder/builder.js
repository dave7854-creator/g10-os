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
  "node_modules", "dist", ".git", ".bolt"
]);

const MAX_FILES = 25;
const AGENT_REGISTRY = {
  manager: {
    name: "Manager",
    model: "gpt-5.6-luna",
    purpose: "Coordinates work and selects the agents needed for each task.",
    enabled: true
  },

  investigator: {
    name: "Investigator",
    model: "gpt-5.6-luna",
    purpose: "Locates relevant files and traces implementation.",
    enabled: true
  },

  supabase: {
    name: "Supabase",
    model: "gpt-5.6-terra",
    purpose: "Handles Supabase, database, authentication, migrations, and Edge Functions.",
    enabled: true
  },

  frontend: {
    name: "Frontend",
    model: "gpt-5.6-terra",
    purpose: "Handles UI, routing, components, and frontend behavior.",
    enabled: true
  },

  debugging: {
    name: "Debugging",
    model: "gpt-5.6-terra",
    purpose: "Investigates bugs, failures, and regressions.",
    enabled: true
  },

  codeModification: {
    name: "Code Modification",
    model: "gpt-5.6-terra",
    purpose: "Prepares minimal safe code changes.",
    enabled: true
  },

  testReview: {
    name: "Test/Review",
    model: "gpt-5.6-terra",
    purpose: "Reviews proposed changes before approval and testing.",
    enabled: true
  },

  ebay: {
    name: "eBay",
    model: null,
    purpose: "Future eBay specialist.",
    enabled: false
  },

  autoParts: {
    name: "Auto Parts",
    model: null,
    purpose: "Future auto parts specialist.",
    enabled: false
  },

  salvage: {
    name: "Salvage",
    model: null,
    purpose: "Future salvage specialist.",
    enabled: false
  },

  towing: {
    name: "Towing",
    model: null,
    purpose: "Future towing specialist.",
    enabled: false
  },

  autoRepair: {
    name: "Auto Repair",
    model: null,
    purpose: "Future automotive repair specialist.",
    enabled: false
  },

  businessOperations: {
    name: "Business Operations",
    model: null,
    purpose: "Future business operations specialist.",
    enabled: false
  },

  research: {
    name: "Research",
    model: null,
    purpose: "Future research specialist.",
    enabled: false
  }
};
const MAX_FILE_CHARS = 80000;
const MAX_TOTAL_CHARS = 350000;
const MAX_RETRIES = 2;

function normalize(p) {
  return p.replaceAll("\\", "/");
}
const KNOWLEDGE_FILE = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "g10-knowledge.json"
);

function loadKnowledge() {
  try {
    if (!fs.existsSync(KNOWLEDGE_FILE)) {
      return {};
    }

    const raw = fs.readFileSync(
      KNOWLEDGE_FILE,
      "utf8"
    );

    return JSON.parse(raw);
  } catch (error) {
    console.log(
      `Knowledge load warning: ${error.message}`
    );

    return {};
  }
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

function buildContext(files) {
  let total = 0;
  let context = "";

  for (const file of files) {
    let content = readFile(file);

    if (content === null) continue;

    if (content.length > MAX_FILE_CHARS) {
      content = content.slice(0, MAX_FILE_CHARS);
    }

    if (total + content.length > MAX_TOTAL_CHARS) {
      break;
    }

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

function detectFastLane(request) {
  const text = request.trim().toLowerCase();

  const riskyTerms = [
    "supabase",
    "database",
    "migration",
    "auth",
    "login",
    "password",
    "edge function",
    "api",
    "ebay",
    "payment",
    "square",
    "security",
    "permission",
    "role",
    "bug",
    "error",
    "failed",
    "failure",
    "not working",
    "doesn't work",
    "does not work"
  ];

  if (riskyTerms.some(term => text.includes(term))) {
    return false;
  }

  const simpleTerms = [
    "change the text",
    "change text",
    "change the heading",
    "change heading",
    "change the title",
    "change title",
    "rename",
    "change the label",
    "change label",
    "change the color",
    "change color",
    "make the text",
    "remove the text",
    "remove text"
  ];

  return simpleTerms.some(term => text.includes(term));
}

async function managerPlan(request) {
  const enabledAgents = Object.entries(AGENT_REGISTRY)
    .filter(([, agent]) => agent.enabled)
    .map(([key, agent]) => ({
      key,
      name: agent.name,
      purpose: agent.purpose
    }));

  const knowledge = loadKnowledge();

  const response = await openai.responses.create({
    model: AGENT_REGISTRY.manager.model,
    reasoning: { effort: "none" },

    input: `
You are the Manager Agent for G10 Builder.

Your job is to decide which specialist agents are needed for the user's request.

USER REQUEST:

${request}

SHARED G10 PROJECT KNOWLEDGE:

${JSON.stringify(knowledge, null, 2)}

AVAILABLE AGENTS:

${JSON.stringify(enabledAgents, null, 2)}

RULES:
- Use the smallest number of agents necessary.
- Investigator should be used for locating or tracing code.
- Supabase should be used for database, authentication, migrations, or Edge Functions.
- Frontend should be used for UI, React, routing, or browser behavior.
- Debugging should be used when diagnosing a bug or failure.
- Code Modification should be used when code changes are requested.
- Test/Review should be used whenever code changes are proposed.
- Do not select disabled agents.
- You do not modify files.
- You do not execute commands.
- You do not access secrets.

Return ONLY valid JSON:

{
  "agents": ["agentKey"],
  "reason": "short explanation"
}
`
  });

  return parseJSON(response.output_text);
}
async function locate(request, fileMap, currentFiles = [], need = "") {
  const knowledge = loadKnowledge();

  const retryText = currentFiles.length
    ? `
FILES ALREADY EXAMINED:
${currentFiles.join("\n")}

THE CODING MODEL SAID IT STILL NEEDS:
${need}

Find the additional files needed to resolve that uncertainty.
Do not simply return the same files again.
`
    : "";

  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    reasoning: { effort: "none" },

    input: `
You are the repository-navigation stage of G10 Builder.

This repository contains multiple distinct surfaces:
- internal G10 OS staff application
- Fort Peck Auto public website
- customer portal
- payment pages
- towing pages
- Supabase Edge Functions
- database migrations

USER REQUEST:
${request}

SHARED G10 PROJECT KNOWLEDGE:
${JSON.stringify(knowledge, null, 2)}

FILE SELECTION RULES:

Use shared knowledge to prioritize files already known to be important for this feature.

Start with the smallest useful set of files.

Do not select every related file just because it might be relevant.

When an important file in shared knowledge directly implements or defines the requested feature, include it before drawing conclusions about that feature.

If the request involves customer portal authentication, provisioning, username lookup, customer_auth_links, portal_status, setup_complete, or manager-created customer credentials, include any known migration that defines those fields or functions before concluding that schema is missing or incompatible.

Distinguish the exact reported failure from adjacent authentication flows. For example, "Invalid login credentials" is a sign-in or credential-provisioning failure. Do not make password recovery, invitation callbacks, or reset routing the primary investigation unless current source evidence connects them directly to the reported sign-in failure.

Prefer files identified in shared knowledge when they directly match the request.

Select additional repository files when the request, imports, dependencies, or current evidence requires them.

Never conclude that a database column, migration, route, or implementation is missing merely because it was not included in the initial file selection. Search the repository and shared knowledge for its definition first.

Current repository source code is authoritative over stored knowledge.
PROJECT FILE MAP:
${fileMap.join("\n")}

${retryText}

Determine the correct application surface before choosing files.

Trace likely:
- HTML entry points
- React entry files
- routing
- imports
- components
- API/service clients
- Supabase Edge Functions
- authentication
- database implementation

Do not assume index.html is the internal application merely because it is named index.html.

Do not select public/customer files for an internal-app request unless they are actually part of the requested behavior.

Return ONLY valid JSON:

{
  "surface": "application surface",
  "files": ["exact/path"],
  "reason": "why these files matter"
}

Only return paths appearing in PROJECT FILE MAP.
`
  });

  return parseJSON(response.output_text);
}
async function runSpecialist(agentKey, request, surface, files) {
  const agent = AGENT_REGISTRY[agentKey];

  if (!agent || !agent.enabled) {
    throw new Error(`Agent unavailable: ${agentKey}`);
  }

  const context = buildContext(files);
  const knowledge = loadKnowledge();

  const response = await openai.responses.create({
    model: agent.model,
    reasoning: {
      effort: agent.model === "gpt-5.6-luna"
        ? "none"
        : "medium"
    },

    input: `
You are the ${agent.name} Agent for G10 Builder.

YOUR PURPOSE:
${agent.purpose}

USER REQUEST:
${request}

SHARED G10 PROJECT KNOWLEDGE:
${JSON.stringify(knowledge, null, 2)}

IMPORTANT:
Treat shared knowledge as supporting context only.
Current source code is authoritative.
If shared knowledge conflicts with current source code, use the current source code.
Do not modify g10-knowledge.json.

TARGET SURFACE:
${surface}

FILES:
${files.join("\n")}

ACTUAL CODE:
${context}

Analyze ONLY from the supplied evidence.

EVIDENCE RULES:
If a required database column, migration, route, function, API, or implementation is not present in the supplied files, do not conclude that it does not exist.
Set needMoreFiles to true and describe exactly what evidence must be located.
Distinguish "not present in supplied evidence" from "confirmed absent from the repository."
Do not diagnose a missing schema field until the migration history defining that table has been checked.
Stay focused on the user's exact reported failure rather than adjacent authentication flows unless source evidence directly connects them.

Do not modify files.
Do not generate replacement file contents.
Do not execute commands.
Do not expose secrets.
Do not invent APIs, schema, functions, routes, or behavior.

Return ONLY valid JSON:

{
  "summary": "concise findings that another agent can use",
  "needMoreFiles": false,
  "need": ""
}
`
  });

  return parseJSON(response.output_text);
}
async function analyze(
  request,
  surface,
  files,
  specialistFindings = [],
  reviewerFeedback = ""
) {
  const context = buildContext(files);
  const knowledge = loadKnowledge();
    const sharedFindings = specialistFindings
    .map(finding =>
      `[${finding.agent.toUpperCase()}]\n${finding.summary}`
    )
    .join("\n\n");

  const response = await openai.responses.create({
    model: "gpt-5.6-terra",
    reasoning: { effort: "medium" },

    input: `
You are the coding and verification stage of G10 Builder.

USER REQUEST:
${request}

SHARED G10 PROJECT KNOWLEDGE:
${JSON.stringify(knowledge, null, 2)}

KNOWLEDGE RULES:
Current source code is authoritative.
Specialist findings are current task evidence.
Stored knowledge is supporting context only.
If stored knowledge conflicts with current source code, use current source code.
Do not modify g10-knowledge.json.

TARGET SURFACE:
${surface}

FILES CURRENTLY AVAILABLE:
${files.join("\n")}

SHARED FINDINGS FROM SPECIALIST AGENTS:
${sharedFindings || "No specialist findings."}

REVIEWER FEEDBACK FROM A PREVIOUS PROPOSAL:
${reviewerFeedback || "No previous reviewer feedback."}

ACTUAL CODE:
${context}

First determine whether these files provide enough evidence to safely make the requested change.

If more repository files are required, return:

{
  "status": "NEED_MORE_FILES",
  "summary": "why more files are required",
  "need": "describe specifically what implementation/file must be located",
  "changes": []
}

If the evidence is sufficient, prepare the SMALLEST safe change.

RULES:
- Modify only supplied files.
- Preserve unrelated behavior.
- Never modify .env.
- Never expose secrets.
- Never modify package-lock.json.
- Never invent schema, APIs, routes, dependencies or functions.
- Verify the change affects the requested surface.
- Return complete replacement contents only for files actually changed.

Return:

{
  "status": "READY",
  "summary": "exactly what will change",
  "need": "",
  "changes": [
    {
      "file": "exact/path",
      "content": "complete replacement contents"
    }
  ]
}

Return ONLY valid JSON.
`
  });

  return parseJSON(response.output_text);
}
async function reviewProposal(request, surface, files, specialistFindings, proposal) {
  const agent = AGENT_REGISTRY.testReview;

  const context = buildContext(files);
  const knowledge = loadKnowledge();

  const sharedFindings = specialistFindings
    .map(finding =>
      `[${finding.agent.toUpperCase()}]\n${finding.summary}`
    )
    .join("\n\n");

  const response = await openai.responses.create({
    model: agent.model,
    reasoning: { effort: "medium" },

    input: `
You are the Test/Review Agent for G10 Builder.

YOUR PURPOSE:
${agent.purpose}

USER REQUEST:
${request}

SHARED G10 PROJECT KNOWLEDGE:
${JSON.stringify(knowledge, null, 2)}

KNOWLEDGE RULES:
Use stored knowledge to help detect conflicts with confirmed G10 architecture and decisions.
Current source code is authoritative.
If stored knowledge conflicts with current source code, use current source code.
Do not modify g10-knowledge.json.

TARGET SURFACE:
${surface}

SPECIALIST FINDINGS:
${sharedFindings || "No specialist findings."}

ACTUAL SOURCE CODE:
${context}

PROPOSED CHANGES:
${JSON.stringify(proposal.changes, null, 2)}

Review the proposed changes BEFORE the user is allowed to approve them.

Check:
- Does the proposal actually address the user's request?
- Is it supported by the supplied source code?
- Did it ignore important specialist findings?
- Is it the smallest safe change?
- Does it modify unrelated behavior?
- Does it invent APIs, schema, routes, dependencies, or functions?
- Does it expose secrets?
- Does it modify protected files?
- Is the proposed file content complete source code rather than patch instructions?
- Are there obvious regressions or additional files that must be changed together?

Do not modify files.
Do not execute commands.

Return ONLY valid JSON:

{
  "status": "APPROVED",
  "summary": "review result",
  "concerns": []
}

If there is any material problem, return:

{
  "status": "CONCERNS",
  "summary": "why the proposal should not be applied",
  "concerns": ["specific concern"]
}
`
  });

  return parseJSON(response.output_text);
}
function makeDiff(oldText, newText) {
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

function validateChanges(changes, allowedFiles) {
  for (const change of changes) {
    if (!allowedFiles.includes(change.file)) {
      throw new Error(
        `Blocked unauthorized change: ${change.file}`
      );
    }

  if (
  change.file.includes(".env") ||
  change.file.endsWith("package-lock.json") ||
  change.file === "g10-builder/g10-knowledge.json"
) {
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

function showDiffs(changes) {
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

function createBackup(changes) {
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

function applyChanges(changes) {
  for (const change of changes) {
    fs.writeFileSync(
      safePath(change.file),
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

    if (fs.existsSync(backup)) {
      fs.copyFileSync(
        backup,
        safePath(change.file)
      );
    }
  }
}

function runBuild() {
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
  console.log("   G10 MULTI-AGENT BUILDER v7   ");
  console.log("====================================");
  console.log("Automatic repository investigation");
  console.log("Diff + backup + build + rollback\n");

  const allFiles = scan(PROJECT_ROOT);

  const fileMap = allFiles.map(file =>
    normalize(
      path.relative(PROJECT_ROOT, file)
    )
  );

  const request = await ask(
    "What do you want to change? "
  );

  const fastLane = detectFastLane(request);

  try {
    console.log("\n[1] Manager selecting agents...");

    const manager = await managerPlan(request);

    console.log(
      `Agents: ${(manager.agents || []).join(", ")}`
    );

    console.log(
      `Reason: ${manager.reason || "No reason provided."}`
    );

    console.log("\n[2] Finding implementation...");

    let selection = await locate(
      request,
      fileMap
    );

    let surface = selection.surface;

    let selected = (selection.files || [])
      .filter(file => fileMap.includes(file))
      .slice(0, MAX_FILES);

    if (!selected.length) {
      throw new Error(
        "No relevant files were found."
      );
    }

        console.log(`\nTarget: ${surface}`);
    console.log(`Reason: ${selection.reason}`);

    const specialistFindings = [];

    const specialists = (manager.agents || []).filter(agent =>
      ["supabase", "frontend", "debugging"].includes(agent)
    );

    for (const agentKey of specialists) {
      console.log(
        `\n[3] Running ${AGENT_REGISTRY[agentKey].name} Agent...`
      );

      const finding = await runSpecialist(
        agentKey,
        request,
        surface,
        selected
      );

      specialistFindings.push({
        agent: agentKey,
        summary: finding.summary,
        needMoreFiles: finding.needMoreFiles,
        need: finding.need
      });

      console.log(
        `${AGENT_REGISTRY[agentKey].name}: ${finding.summary}`
      );
    }
    const specialistNeeds = specialistFindings
      .filter(finding =>
        finding.needMoreFiles &&
        finding.need
      )
      .map(finding => finding.need);

    if (specialistNeeds.length) {
      console.log(
        "\n[3.5] Specialists requested additional evidence..."
      );

      const more = await locate(
        request,
        fileMap,
        selected,
        specialistNeeds.join("\n")
      );

     const additions = (more.files || [])
  .filter(file =>
    fileMap.includes(file) &&
    !selected.includes(file)
  )
  .slice(0, 2);

      selected = [
        ...additions,
        ...selected.filter(
          file => !additions.includes(file)
        )
      ].slice(0, MAX_FILES);

      if (additions.length) {
        console.log("\nAdditional specialist files found:");

        additions.forEach(file =>
          console.log(`  • ${file}`)
        );

        console.log(
          "\n[3.6] Rerunning specialists with additional evidence..."
        );

        for (const finding of specialistFindings) {
          if (
            !finding.needMoreFiles ||
            !finding.need
          ) {
            continue;
          }

          console.log(
            `Rerunning ${AGENT_REGISTRY[finding.agent].name} Agent...`
          );

          const updatedFinding = await runSpecialist(
            finding.agent,
            request,
            surface,
            selected
          );

          finding.summary = updatedFinding.summary;
          finding.needMoreFiles = updatedFinding.needMoreFiles;
          finding.need = updatedFinding.need;

          console.log(
            `${AGENT_REGISTRY[finding.agent].name}: ${updatedFinding.summary}`
          );
          if (finding.needMoreFiles) {
  console.log(
    `${AGENT_REGISTRY[finding.agent].name} requested more files: ${finding.need}`
  );
}
        }
      }
    }
      let proposal;

    for (
      let attempt = 0;
      attempt <= MAX_RETRIES;
      attempt++
    ) {
      console.log(
        `\nAnalyzing ${selected.length} file(s)...`
      );

      selected.forEach(file =>
        console.log(`  • ${file}`)
      );

          proposal = await analyze(
        request,
        surface,
        selected,
        specialistFindings
      );

      if (proposal.status === "READY") {
        break;
      }

      if (
        proposal.status !== "NEED_MORE_FILES" ||
        attempt === MAX_RETRIES
      ) {
        break;
      }

      console.log("\nMore code is needed.");
      console.log(proposal.need);

      console.log(
        "\nAutomatically searching for it..."
      );

      const more = await locate(
        request,
        fileMap,
        selected,
        proposal.need
      );

      const additions = (more.files || [])
        .filter(file =>
          fileMap.includes(file) &&
          !selected.includes(file)
        );

    selected = [
  ...additions,
  ...selected.filter(file => !additions.includes(file))
].slice(0, MAX_FILES);

      if (!additions.length) {
        break;
      }
    }

    console.log("\n====================================");
    console.log("          PROPOSED CHANGE");
    console.log("====================================\n");

    console.log(proposal.summary);

    if (
      proposal.status !== "READY" ||
      !proposal.changes?.length
    ) {
      console.log("\nNothing changed.");
      return;
    }

    validateChanges(
      proposal.changes,
      selected
    );
    let review;

if (fastLane) {
  console.log("\n[4] FAST LANE — skipping AI Test/Review");

  review = {
    status: "APPROVED",
    summary: "Fast-lane edit requires user approval of exact diff.",
    concerns: []
  };
} else {
  console.log("\n[4] Test/Review Agent checking proposal...");

  review = await reviewProposal(
    request,
    surface,
    selected,
    specialistFindings,
    proposal
  );

  console.log(`Review: ${review.summary}`);
}

    if (review.status !== "APPROVED") {
      console.log("\n[5] Review found concerns. Sending them back for one correction...");

      if (review.concerns?.length) {
        review.concerns.forEach(concern =>
          console.log(`  • ${concern}`)
        );
      }

      const reviewerFeedback = [
        review.summary,
        ...(review.concerns || [])
      ].join("\n");

      proposal = await analyze(
        request,
        surface,
        selected,
        specialistFindings,
        reviewerFeedback
      );

      if (
        proposal.status !== "READY" ||
        !proposal.changes?.length
      ) {
        console.log("\nCorrection attempt did not produce a safe proposal.");
        console.log("\nNothing changed.");
        return;
      }

      validateChanges(
        proposal.changes,
        selected
      );

      console.log("\n[6] Test/Review Agent checking corrected proposal...");

      const secondReview = await reviewProposal(
        request,
        surface,
        selected,
        specialistFindings,
        proposal
      );

      console.log(`Review: ${secondReview.summary}`);

      if (secondReview.status !== "APPROVED") {
        console.log("\nSAFETY STOP — corrected proposal was still not approved.");

        if (secondReview.concerns?.length) {
          secondReview.concerns.forEach(concern =>
            console.log(`  • ${concern}`)
          );
        }

        console.log("\nNothing changed.");
        return;
      }

      console.log("\nCorrected proposal passed review.");
    }

    console.log("\nReview passed.");
    console.log("\nFiles to modify:");

    proposal.changes.forEach(change =>
      console.log(`  • ${change.file}`)
    );

    showDiffs(proposal.changes);

    const approval = await ask(
      "\nType YES to backup, apply and build-test: "
    );

    if (approval.toUpperCase() !== "YES") {
      console.log(
        "\nCancelled. Nothing changed."
      );
      return;
    }

    const backupDir = createBackup(
      proposal.changes
    );

    console.log(`\nBackup: ${backupDir}`);

    applyChanges(proposal.changes);

    console.log("\nChanges applied.");

    try {
      runBuild();

      console.log("\n====================================");
      console.log("            BUILD PASSED");
      console.log("Changes kept.");
      console.log("====================================\n");

    } catch {
      console.log("\nBUILD FAILED.");
      console.log("Restoring originals...");

      restoreBackup(
        proposal.changes,
        backupDir
      );

      console.log("\n====================================");
      console.log("          ROLLBACK COMPLETE");
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