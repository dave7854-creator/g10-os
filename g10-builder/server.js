// G10 Builder API server — Phase 1 hardened.
//
// Security model:
// - Every /api/* route requires a Bearer token (BUILDER_API_TOKEN). Missing or
//   wrong token -> 401. The server refuses to start without a token configured.
// - CORS is restricted to BUILDER_ALLOWED_ORIGINS (comma-separated). If unset,
//   cross-origin browser access is disabled entirely. A wildcard is rejected.
// - The bundled web UI is served from ./ui by this same server, so it does not
//   need CORS. Secrets (OpenAI key, GitHub token, service-role key) never
//   leave the server: job logs and streamed output are redacted, and no
//   endpoint echoes environment variables.
// - Binds to 127.0.0.1 by default; set BUILDER_HOST=0.0.0.0 to expose on the
//   LAN (only do this behind additional network controls).

import "dotenv/config";
import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createJob,
  getJob,
  listJobs,
  approveJob,
  rejectJob,
  redactSecrets,
} from "./jobs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.BUILDER_PORT || "3001", 10);
const HOST = process.env.BUILDER_HOST || "127.0.0.1";
const API_TOKEN = process.env.BUILDER_API_TOKEN;

if (!API_TOKEN) {
  console.error(
    "FATAL: BUILDER_API_TOKEN is not set.\n" +
      "Set it in g10-builder/.env (see g10-builder/.env.example) and restart.\n" +
      "The server will not run without API authentication."
  );
  process.exit(1);
}

const allowedOrigins = (process.env.BUILDER_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (allowedOrigins.includes("*")) {
  console.error(
    "FATAL: BUILDER_ALLOWED_ORIGINS must not contain '*'. " +
      "List explicit origins instead."
  );
  process.exit(1);
}

const app = express();

// Restricted CORS: explicit allowlist, or disabled entirely when unset.
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : { origin: false }));
app.use(express.json({ limit: "2mb" }));

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token || token !== API_TOKEN) {
    return res.status(401).json({
      error: "Unauthorized. Provide a valid Bearer token.",
    });
  }
  next();
}

function toHttpError(error, fallbackStatus = 500) {
  const status = error.statusCode || fallbackStatus;
  return { status, body: { error: error.message || "Internal error." } };
}

app.use("/api", requireAuth);

// ---- web UI (served same-origin; no CORS needed) -----------------------------
app.use(express.static(path.join(__dirname, "ui")));

// ---- status ------------------------------------------------------------------
let legacyBuilderRunning = false;

app.get("/api/status", (req, res) => {
  const active = listJobs().find((j) => j.status === "running" || j.status === "applying");
  res.json({
    online: true,
    builderRunning: Boolean(active) || legacyBuilderRunning,
    activeJob: active ? active.id : null,
  });
});

// ---- jobs (web approval flow) -------------------------------------------------
app.post("/api/jobs", (req, res) => {
  const request = String(req.body?.request || "").trim();

  if (!request) {
    return res.status(400).json({ error: "Request is required." });
  }

  try {
    const job = createJob(request);
    res.status(201).json({
      job: {
        id: job.id,
        request: job.request,
        status: job.status,
        createdAt: job.createdAt,
      },
    });
  } catch (error) {
    const { status, body } = toHttpError(error, 409);
    res.status(status).json(body);
  }
});

app.get("/api/jobs", (req, res) => {
  res.json({ jobs: listJobs() });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found." });
  }
  // Never leak anything beyond the job record itself; logs are redacted at
  // write time in jobs.js.
  res.json({ job });
});

app.post("/api/jobs/:id/approve", async (req, res) => {
  try {
    const job = await approveJob(req.params.id);
    res.json({ job });
  } catch (error) {
    const { status, body } = toHttpError(error, 409);
    res.status(status).json(body);
  }
});

app.post("/api/jobs/:id/reject", (req, res) => {
  const reason = String(req.body?.reason || "").slice(0, 500);
  try {
    const job = rejectJob(req.params.id, reason);
    res.json({ job });
  } catch (error) {
    const { status, body } = toHttpError(error, 409);
    res.status(status).json(body);
  }
});

// ---- legacy terminal-driven flow (kept as a fallback) --------------------------
// Streams builder.js stdout/stderr and feeds stdin. Now authenticated and with
// redacted output. Prefer the /api/jobs flow for web use.

let activeBuilder = null;

app.post("/api/builder/run", (req, res) => {
  const request = String(req.body?.request || "").trim();

  if (!request) {
    return res.status(400).json({
      error: "Request is required.",
    });
  }

  if (activeBuilder) {
    return res.status(409).json({
      error: "Builder is already running.",
    });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  const builderPath = path.join(__dirname, "builder.js");

  activeBuilder = spawn(
    process.execPath,
    [builderPath],
    {
      cwd: __dirname,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  legacyBuilderRunning = true;

  activeBuilder.stdout.on("data", (data) => {
    res.write(redactSecrets(data.toString()));
  });

  activeBuilder.stderr.on("data", (data) => {
    res.write(redactSecrets(data.toString()));
  });

  activeBuilder.on("error", (error) => {
    res.write(`\nBuilder process error: ${redactSecrets(error.message)}\n`);
    activeBuilder = null;
    legacyBuilderRunning = false;
    res.end();
  });

  activeBuilder.on("close", (code) => {
    res.write(`\nBuilder exited with code ${code}.\n`);
    activeBuilder = null;
    legacyBuilderRunning = false;
    res.end();
  });

  activeBuilder.stdin.write(`${request}\n`);
});

app.post("/api/builder/respond", (req, res) => {
  const response = String(req.body?.response || "").trim();

  if (!activeBuilder) {
    return res.status(409).json({
      error: "No Builder process is waiting.",
    });
  }

  activeBuilder.stdin.write(`${response}\n`);

  res.json({
    ok: true,
  });
});

app.listen(PORT, HOST, () => {
  console.log(`G10 Builder server running on http://${HOST}:${PORT}`);
  console.log(
    `CORS: ${allowedOrigins.length ? allowedOrigins.join(", ") : "disabled (same-origin only)"}`
  );
});
