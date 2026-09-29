import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let activeBuilder = null;

app.get("/api/status", (req, res) => {
  res.json({
    online: true,
    builderRunning: Boolean(activeBuilder),
  });
});

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

  activeBuilder.stdout.on("data", (data) => {
    res.write(data.toString());
  });

  activeBuilder.stderr.on("data", (data) => {
    res.write(data.toString());
  });

  activeBuilder.on("error", (error) => {
    res.write(`\nBuilder process error: ${error.message}\n`);
    activeBuilder = null;
    res.end();
  });

  activeBuilder.on("close", (code) => {
    res.write(`\nBuilder exited with code ${code}.\n`);
    activeBuilder = null;
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

app.listen(PORT, () => {
  console.log(`G10 Builder server running on http://localhost:${PORT}`);
});