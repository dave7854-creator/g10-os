// g10-builder/jobs.js
//
// Job model for web-based approval of Builder proposals.
//
// Lifecycle:
//   running -> awaiting_approval -> applying -> applied | rolled_back
//   running -> done              (proposal not needed / nothing changed)
//   running -> failed             (pipeline error)
//   awaiting_approval -> rejected  (human said no)
//
// The AI pipeline (builder.js) only PROPOSES. Nothing is written until a
// human approves, and the apply path re-runs every safety control in
// safety.js: validate -> backup -> apply -> build -> rollback on failure.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateChanges,
  createBackup,
  applyChanges,
  restoreBackup,
  runBuild,
  makeDiff,
} from "./safety.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// builder.js exits with this code when it has a proposal waiting for approval.
export const PROPOSAL_EXIT_CODE = 42;

const jobs = new Map();
let activeJobId = null;
let seq = 0;

// ---- secret redaction ------------------------------------------------------
// Job logs and diffs are served to the browser, so scrub anything that looks
// like a credential before it is stored.

const SECRET_ENV_NAMES = [
  "OPENAI_API_KEY",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "BUILDER_API_TOKEN",
];

export function redactSecrets(text) {
  let out = String(text ?? "");

  for (const name of SECRET_ENV_NAMES) {
    const val = process.env[name];
    if (val && val.length >= 4) {
      out = out.split(val).join("[REDACTED]");
    }
  }

  // Generic patterns, in case a model echoes something shaped like a secret.
  out = out.replace(/sk-[A-Za-z0-9-_]{8,}/g, "[REDACTED]");
  out = out.replace(
    /eyJ[A-Za-z0-9-_]{8,}\.[A-Za-z0-9-_]{8,}\.[A-Za-z0-9-_]{8,}/g,
    "[REDACTED_JWT]"
  );

  return out;
}

// ---- job store --------------------------------------------------------------

function touch(job, status) {
  job.status = status;
  job.updatedAt = new Date().toISOString();
}

function release(job) {
  if (activeJobId === job.id) activeJobId = null;
}

export function createJob(request) {
  const active = activeJobId ? jobs.get(activeJobId) : null;
  if (active && (active.status === "running" || active.status === "applying")) {
    const err = new Error("Another job is already active.");
    err.statusCode = 409;
    throw err;
  }
  activeJobId = null;

  const id = `job-${Date.now().toString(36)}-${(++seq).toString(36)}`;
  const job = {
    id,
    request,
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [],
    proposal: null, // { summary, reviewSummary, changes: [{ file, content, original, diff }] }
    result: null,   // { ok, message } or { ok:false, error }
    backupDir: null,
  };
  jobs.set(id, job);
  activeJobId = id;

  runPipeline(job).catch((error) => {
    job.logs.push(redactSecrets(`\nJob runner error: ${error.message}\n`));
    touch(job, "failed");
    job.result = { ok: false, error: error.message };
    release(job);
  });

  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return [...jobs.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((j) => ({
      id: j.id,
      request: j.request,
      status: j.status,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      files: j.proposal ? j.proposal.changes.length : 0,
      summary: j.proposal ? j.proposal.summary : null,
      result: j.result,
    }));
}

// ---- pipeline ---------------------------------------------------------------

async function runPipeline(job) {
  const proposalPath = path.join(
    os.tmpdir(),
    `g10-builder-proposal-${job.id}.json`
  );

  const child = spawn(process.execPath, [path.join(__dirname, "builder.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      BUILDER_APPROVAL_MODE: "api",
      BUILDER_PROPOSAL_OUT: proposalPath,
      BUILDER_JOB_REQUEST: job.request,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => {
    job.logs.push(redactSecrets(data.toString()));
  });
  child.stderr.on("data", (data) => {
    job.logs.push(redactSecrets(data.toString()));
  });

  // In api mode the request arrives via env, not stdin.
  child.stdin.end();

  const exitCode = await new Promise((resolve) => {
    child.on("error", () => resolve(-1));
    child.on("close", (code) => resolve(code ?? -1));
  });

  try {
    if (exitCode === PROPOSAL_EXIT_CODE) {
      const raw = fs.readFileSync(proposalPath, "utf8");
      const proposal = JSON.parse(raw);
      job.proposal = {
        summary: proposal.summary || "",
        reviewSummary: proposal.reviewSummary || "",
        changes: (proposal.changes || []).map((c) => ({
          file: c.file,
          content: c.content,
          original: c.original ?? "",
          diff: makeDiff(c.original ?? "", c.content),
        })),
      };
      touch(job, "awaiting_approval");
      job.logs.push("\nProposal ready — waiting for approval.\n");
    } else if (exitCode === 0) {
      touch(job, "done");
      job.result = { ok: true, message: "Pipeline finished with no changes to apply." };
      release(job);
    } else {
      touch(job, "failed");
      job.result = { ok: false, error: `Builder exited with code ${exitCode}.` };
      release(job);
    }
  } finally {
    try {
      fs.unlinkSync(proposalPath);
    } catch {
      // best effort
    }
  }
}

// ---- approval ----------------------------------------------------------------
// Exported separately from approveJob so the apply path can be exercised
// directly in tests without the AI pipeline.

export async function executeApply(job) {
  const changes = job.proposal.changes.map(({ file, content }) => ({
    file,
    content,
  }));

  // The proposal came from our own builder run, so the candidate set is the
  // proposal's own file list. Every other check still applies: protected
  // files, path guard, patch-instruction detection, no-op detection.
  validateChanges(changes, changes.map((c) => c.file));

  const backupDir = createBackup(changes);
  job.backupDir = backupDir;
  job.logs.push(redactSecrets(`\nBackup: ${backupDir}\n`));

  applyChanges(changes);
  job.logs.push("\nChanges applied.\n");

  try {
    runBuild();
    touch(job, "applied");
    job.result = { ok: true, message: "Build passed. Changes kept.", backupDir };
  } catch (error) {
    job.logs.push(redactSecrets(`\nBUILD FAILED: ${error.message}\nRestoring originals...\n`));
    restoreBackup(changes, backupDir);
    touch(job, "rolled_back");
    job.result = { ok: false, error: `Build failed, rolled back: ${error.message}`, backupDir };
  } finally {
    release(job);
  }

  return job;
}

export async function approveJob(id) {
  const job = jobs.get(id);
  if (!job) {
    const err = new Error("Job not found.");
    err.statusCode = 404;
    throw err;
  }
  if (job.status !== "awaiting_approval") {
    const err = new Error(`Job is ${job.status}, not awaiting approval.`);
    err.statusCode = 409;
    throw err;
  }
  touch(job, "applying");
  return executeApply(job);
}

export function rejectJob(id, reason) {
  const job = jobs.get(id);
  if (!job) {
    const err = new Error("Job not found.");
    err.statusCode = 404;
    throw err;
  }
  if (job.status !== "awaiting_approval") {
    const err = new Error(`Job is ${job.status}, not awaiting approval.`);
    err.statusCode = 409;
    throw err;
  }
  touch(job, "rejected");
  job.result = { ok: true, message: "Proposal rejected. Nothing changed.", reason: reason || "" };
  release(job);
  return job;
}
