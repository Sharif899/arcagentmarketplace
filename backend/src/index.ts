import "dotenv/config";
import express from "express";
import cors from "cors";
import { router } from "./routes.js";

const PORT = process.env.PORT ?? 3001;

const app = express();

app.use(cors());
app.use(express.json());

// All API routes under /api
app.use("/api", router);

// Root ping
app.get("/", (_req, res) => {
  res.json({ service: "Arc Agent Marketplace API", version: "1.0.0" });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Arc Agent Marketplace API running`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://localhost:${PORT}/api/health`);
  console.log(`   http://localhost:${PORT}/api/wallet\n`);
});
