import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // LINE Notify Proxy
  app.post("/api/line-notify", async (req, res) => {
    const { message } = req.body;
    const token = process.env.LINE_NOTIFY_TOKEN;

    if (!token) {
      console.warn("LINE_NOTIFY_TOKEN not set");
      return res.status(500).json({ error: "LINE_NOTIFY_TOKEN not set" });
    }

    try {
      const response = await fetch("https://notify-api.line.me/api/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${token}`,
        },
        body: new URLSearchParams({ message }).toString(),
      });

      if (response.ok) {
        res.json({ success: true });
      } else {
        const error = await response.text();
        res.status(response.status).json({ error });
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Google Sheets Proxy
  app.post("/api/sheets-sync", async (req, res) => {
    const { url, data } = req.body;
    if (!url) return res.status(400).json({ error: "No Sheet URL provided" });

    try {
      const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify(data),
      });
      const result = await response.text();
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
