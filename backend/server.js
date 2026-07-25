import express from "express";
import cors from "cors";
import morgan from "morgan";

import { PORT, NODE_ENV, IS_PRODUCTION, CORS_ORIGINS, DEV_DEFAULT_ORIGINS, REQUEST_TIMEOUT_MS } from "./src/config.js";
import { logger } from "./src/lib/logger.js";
import { sessionRouter } from "./src/routes/session.js";
import { generateCharacterRouter } from "./src/routes/generateCharacter.js";
import { battleTurnRouter } from "./src/routes/battleTurn.js";
import { errorHandler, notFoundHandler } from "./src/middleware/errorHandler.js";
import { requestTimeout } from "./src/middleware/timeout.js";
import { sessionCount } from "./src/lib/sessionStore.js";

// Never let one bad promise or stray exception take the whole instance down
// silently on Render — log it loudly instead.
process.on("unhandledRejection", (reason) => {
  logger.error("process:unhandledRejection", { message: reason?.message || String(reason), stack: reason?.stack });
});
process.on("uncaughtException", (err) => {
  logger.error("process:uncaughtException", { message: err.message, stack: err.stack });
});

const app = express();

// Render (and most PaaS) sit behind a reverse proxy — needed for correct
// client IPs in logs and correct protocol detection.
app.set("trust proxy", 1);

const allowedOrigins = IS_PRODUCTION ? CORS_ORIGINS : [...new Set([...CORS_ORIGINS, ...DEV_DEFAULT_ORIGINS])];

if (IS_PRODUCTION && allowedOrigins.length === 0) {
  logger.warn("cors:no-origins-configured", {
    message: "NODE_ENV=production but CORS_ORIGIN is empty — all cross-origin requests will be rejected.",
  });
}

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header = same-origin, curl, server-to-server health checks — allow.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(requestTimeout(REQUEST_TIMEOUT_MS));
app.use(express.json({ limit: "1mb" }));
app.use(
  morgan(IS_PRODUCTION ? "combined" : "dev", {
    stream: { write: (msg) => logger.info("http", msg.trim()) },
  })
);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    env: NODE_ENV,
    sessions: sessionCount(),
    uptimeSec: Math.round(process.uptime()),
  });
});

app.use("/api", sessionRouter);
app.use("/api", generateCharacterRouter);
app.use("/api", battleTurnRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info("server:started", { port: PORT, env: NODE_ENV, allowedOrigins });
});

// Render sends SIGTERM on deploys/restarts — exit cleanly instead of
// dropping in-flight requests abruptly.
process.on("SIGTERM", () => {
  logger.info("server:sigterm", { message: "Shutting down gracefully." });
  server.close(() => process.exit(0));
});

