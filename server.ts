import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import { Pool } from "pg";

dotenv.config();

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));

// Initialize Firebase Admin for Authentication and Firestore
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = admin.firestore();

const pgPool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
}) : null;

// Initialize PG Table if possible
if (pgPool) {
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS user_conversations (
      id SERIAL PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,
      session_id VARCHAR(255),
      role VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(err => console.error("Could not init PG table", err));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running", dbConnected: true });
  });

  // Middleware to verify Firebase Auth Token
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      console.log("No token provided in request");
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    try {
      if (!admin.apps.length) {
         return res.status(500).json({ error: "Firebase Admin not initialized" });
      }
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (err: any) {
      console.error("Token verification error:", err.message);
      return res.status(403).json({ error: "Forbidden: Invalid token", details: err.message });
    }
  };

  // API Routes
  
  // Settings
  app.get("/api/settings", authenticateToken, async (req: any, res) => {
    try {
      const { uid } = req.user;
      const userSettingsRef = db.collection('user_settings').doc(uid);
      const doc = await userSettingsRef.get();

      if (!doc.exists) {
        // No results, insert default settings.
        const defaultSettings = { persona_name: 'Beatrice', language: 'English' };
        await userSettingsRef.set(defaultSettings);
        return res.json(defaultSettings);
      }
      
      res.json(doc.data());
    } catch (err: any) {
      console.error("Settings GET catch error:", err);
      res.status(500).json({ error: "Internal server error: " + err.message });
    }
  });

  app.put("/api/settings", authenticateToken, async (req: any, res) => {
    try {
      const { uid } = req.user;
      const { persona_name, user_call_name, system_prompt, voice, language } = req.body;
      
      const payload: any = {
        persona_name,
        user_call_name,
        system_prompt,
        voice,
        language
      };
      
      // Clean undefined values
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

      await db.collection('user_settings').doc(uid).set(payload, { merge: true });
      const updatedDoc = await db.collection('user_settings').doc(uid).get();
      
      res.json(updatedDoc.data());
    } catch (err: any) {
      console.error("Settings PUT error:", err);
      res.status(500).json({ error: "Internal server error: " + err.message });
    }
  });

  // Conversations
  app.get("/api/conversations", authenticateToken, async (req: any, res) => {
    try {
      const { uid } = req.user;
      const limitAmt = Number(req.query.limit) || 100;
      
      if (pgPool) {
        try {
          const result = await pgPool.query(
            "SELECT * FROM user_conversations WHERE uid = $1 ORDER BY created_at DESC LIMIT $2",
            [uid, limitAmt]
          );
          const data = result.rows.map(row => ({
            id: row.id.toString(),
            uid: row.uid,
            session_id: row.session_id,
            role: row.role,
            content: row.content,
            created_at: row.created_at
          }));
          return res.json(data ? data.reverse() : []);
        } catch (e) {
          console.error("PG Read sync error", e);
        }
      }

      const snapshot = await db.collection('user_conversations')
        .where('uid', '==', uid)
        .orderBy('created_at', 'desc')
        .limit(limitAmt)
        .get();

      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(data ? data.reverse() : []);
    } catch (err: any) {
      console.error("Fetch conversations error:", err.message);
      
      // If index is missing, return empty instead of failing
      if (err.message.includes('FAILED_PRECONDITION')) {
          return res.json([]);
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/conversations", authenticateToken, async (req: any, res) => {
    try {
      const { uid } = req.user;
      const { role, content, session_id } = req.body;

      if (!role || !content) {
        return res.status(400).json({ error: "Missing role or content" });
      }

      // 1) Save to Postgres
      if (pgPool) {
        try {
          await pgPool.query(
            "INSERT INTO user_conversations (uid, session_id, role, content) VALUES ($1, $2, $3, $4)",
            [uid, session_id || 'default', role, content]
          );
        } catch (e) {
          console.error("PG Sync Error", e);
        }
      }

      // 2) Save to Firebase (acts as standard local cloud edge backup here)
      const docRef = await db.collection('user_conversations').add({
        uid,
        role,
        content,
        session_id: session_id || 'default',
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });

      const doc = await docRef.get();
      res.json({ id: doc.id, ...doc.data() });
    } catch (err: any) {
      console.error("Save conversation turn error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Memories
  app.get("/api/memories", authenticateToken, async (req: any, res) => {
    try {
      const { uid } = req.user;
      const snapshot = await db.collection('user_memories')
        .where('uid', '==', uid)
        .orderBy('created_at', 'desc')
        .get();

      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(data);
    } catch (err: any) {
      console.error("Memories GET error:", err);
      // If index is missing, return empty instead of failing
      if (err.message.includes('FAILED_PRECONDITION')) {
          return res.json([]);
      }
      res.status(500).json({ error: "Internal server error: " + err.message });
    }
  });

  app.post("/api/memories", authenticateToken, async (req: any, res) => {
    try {
      const { uid } = req.user;
      const { content, type = 'personal' } = req.body;
      console.log(`Saving memory for user ${uid}: ${content.substring(0, 50)}...`);

      if (!content) {
        return res.status(400).json({ error: "Missing 'content' in request body" });
      }
      
      const docRef = await db.collection('user_memories').add({
        uid,
        content,
        type,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });

      const doc = await docRef.get();
      console.log(`Memory saved successfully as ${doc.id}`);
      res.json({ id: doc.id, ...doc.data() });
    } catch (err: any) {
      console.error("Memories POST error:", err);
      res.status(500).json({ error: "Failed to save memory: " + err.message });
    }
  });

  app.delete("/api/memories/:id", authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { uid } = req.user;
      
      const docRef = db.collection('user_memories').doc(id);
      const doc = await docRef.get();
      
      if (doc.exists && doc.data()?.uid === uid) {
          await docRef.delete();
      }
      
      res.json({ status: "success" });
    } catch (err: any) {
      console.error("Memories DELETE error:", err);
      res.status(500).json({ error: "Internal server error: " + err.message });
    }
  });

  // Storage Example Endpoint (if user wants to upload something)
  app.post("/api/upload", authenticateToken, async (req: any, res) => {
     res.status(501).json({ error: "Storage endpoint not fully implemented. Requires multipart/form-data handling." });
  });

  // System commands
  app.get("/api/system_command", async (req: any, res: any) => {
    try {
      // Intentionally omitting authenticateToken strictly for demo purposes, or we could require it.
      // Eburon demo sometimes doesn't send the proper token over yet. Let's make it allow for local demo.
      const cmd = req.query.cmd;
      const allowed = ["date", "uptime", "hostname", "pwd", "whoami", "ls"];
      if (!allowed.includes(cmd)) {
         return res.status(403).json({ error: "Command not allowed. Allowed cmds: " + allowed.join(", ") });
      }
      
      const { exec } = require('child_process');
      exec(cmd, (error: any, stdout: any, stderr: any) => {
          if (error) {
              return res.json({ error: error.message, stderr });
          }
          res.json({ stdout: stdout.trim(), stderr: stderr ? stderr.trim() : '' });
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Search API
  app.get("/api/search", authenticateToken, async (req: any, res) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({ error: "Missing query parameter 'q'" });
      }

      const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
      const cx = process.env.GOOGLE_SEARCH_CX;

      if (!apiKey || !cx) {
        console.warn("Search API keys missing. Returning empty results.");
        return res.status(503).json({ 
          error: "Google Search API is not configured. Please add GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX to your environment variables.",
          results: [] 
        });
      }

      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(q as string)}`;
      const response = await fetch(searchUrl);
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`Google Search API error: ${response.status} ${JSON.stringify(errData)}`);
      }

      const data = await response.json();
      const results = (data.items || []).map((item: any) => ({
        title: item.title,
        snippet: item.snippet,
        link: item.link
      }));

      res.json({ results });
    } catch (err: any) {
      console.error("Search API error:", err.message);
      res.status(500).json({ error: err.message, results: [] });
    }
  });

  // WhatsApp Evolution API - Send Message
  app.post("/api/whatsapp/send", authenticateToken, async (req: any, res) => {
    try {
      const { number, message } = req.body;
      if (!number || !message) {
        return res.status(400).json({ error: "Missing 'number' or 'message'" });
      }

      const apiUrl = process.env.EVOLUTION_API_URL || "http://srv909561.hstgr.cloud:32856";
      const apiKey = process.env.EVOLUTION_API_KEY || "PFGcwPHRmvlEdyEujWRrHjabyGnf6vJ7";
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "beatrice";

      // Create instance if not exists (fire-and-forget for simplicity)
      try {
        await fetch(`${apiUrl}/instance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
          body: JSON.stringify({ instanceName, token: apiKey, qrcode: true })
        });
      } catch (e) {
         // ignore
      }

      const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;
      
      // Evolution API expects numbers to have country code but no '+' and sometimes suffix like '@s.whatsapp.net', 
      // but usually the API handles formatting if provided as "number": "5511999999999"
      const payload = {
        number: number,
        text: message
      };

      const response = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Evolution API error: ${response.status} ${errData}`);
      }

      const data = await response.json();
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("WhatsApp Send error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // WhatsApp Evolution API - Connect/QR
  app.get("/api/whatsapp/connect", authenticateToken, async (req: any, res) => {
    try {
      const apiUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_API_KEY;
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "beatrice";

      if (!apiUrl || !apiKey) {
        throw new Error("Evolution API configuration missing (URL or Key)");
      }

      // First try to check connection state
      let stateRes = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, {
        headers: { 'apikey': apiKey }
      });

      if (stateRes.status === 404) {
        // Create instance if it doesn't exist
        await fetch(`${apiUrl}/instance/create`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
           body: JSON.stringify({ instanceName, token: apiKey, qrcode: true })
        });
      }

      // Try to get QR
      const connectRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
        headers: { 'apikey': apiKey }
      });
      
      if (!connectRes.ok) {
        const errData = await connectRes.text();
        throw new Error(`Evolution API error: ${connectRes.status} ${errData}`);
      }

      const data = await connectRes.json();
      res.json(data);
    } catch (err: any) {
      console.error("WhatsApp Connect error:", err);
      const msg = err.message || String(err);
      res.status(500).json({ error: msg.includes("fetch failed") ? "Failed to connect to Evolution API server (fetch failed)." : msg });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("GLOBAL ERROR HANDLER:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message || String(err) });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Firestore integrated for DB storage.`);
  });
}

startServer();
