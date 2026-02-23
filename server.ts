
import express from "express";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import path from "path";
import { GoogleGenAI } from "@google/genai";

dotenv.config();
const app = express();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("FATAL: GEMINI_API_KEY not set.");
}


const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY});

import helmet from "helmet";
app.use(helmet({ contentSecurityPolicy: false }));
app.set("trust proxy", 1); 

const PORT = process.env.PORT|| 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/jointhub";
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });




// --- MongoDB Setup ---
// --- MongoDB Setup ---
mongoose.set("bufferCommands", false);

if (!process.env.MONGODB_URI) {
  console.error("❌ FATAL: MONGODB_URI not set in environment");
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
})
.then(() => {
  console.log("✅ Connected to MongoDB Atlas");
})
.catch((err) => {
  console.error("❌ MongoDB connection error:", err);
});

// Helper to check DB connection
const checkDbConnection = (req: any, res: any, next: any) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ 
      error: "Database not connected. Please check your MONGODB_URI configuration.",
      status: "DB_DISCONNECTED"
    });
  }
  next();
};

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messages: [{
    sender: String,
    text: String,
    isImage: Boolean,
    timestamp: { type: Date, default: Date.now }
  }]
});

const User = mongoose.model('User', userSchema);
const Chat = mongoose.model('Chat', chatSchema);


// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});
app.use("/api/", limiter);

// --- Auth Middleware ---
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    // Attach the decoded token (which contains id and username) to req.user
    req.user = decoded; 
    next();
  });
};

// --- API Routes ---

// Auth
app.post("/api/auth/register", checkDbConnection, async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "User registered" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/auth/login", checkDbConnection, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);
    res.json({ token, username: user.username });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Chat History
app.get("/api/chat/history", authenticateToken, checkDbConnection, async (req: any, res) => {
  try {
    const chat = await Chat.findOne({ userId: req.user.id });
    res.json(chat ? chat.messages : []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat/save", authenticateToken, checkDbConnection, async (req: any, res) => {
  try {
    const { message } = req.body;
    let chat = await Chat.findOne({ userId: req.user.id });
    if (!chat) {
      chat = new Chat({ userId: req.user.id, messages: [] });
    }
    chat.messages.push(message);
    if (chat.messages.length > 100) chat.messages.shift();
    await chat.save();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat/clear", authenticateToken, checkDbConnection, async (req: any, res) => {
  try {
    await Chat.deleteOne({ userId: req.user.id });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Gemini Text Generation Route
app.post("/api/generate-text", async (req, res) => {
  try {
    const { contents, systemInstruction } = req.body;

    // Validate input
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({ error: "Missing or invalid contents array." });
    }

    // Generate text using Gemini 3 Flash Preview
    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      systemInstruction: systemInstruction?.parts?.[0]?.text || "",
      temperature: 0.7,
    });

    // Send response
    res.json({
      candidates: [
        {
          content: {
            parts: [{ text: response.text }]
          }
        }
      ]
    });
  } catch (error: any) {
    console.error("❌ /api/generate-text error:", error);
    res.status(500).json({ error: error.message });
  }
});
//OpenAI Image
app.post("/api/generate-image", async (req, res) => {
  try {
    const { instances } = req.body;
    const prompt = instances?.[0]?.prompt;

    if (!prompt) {
      return res.status(400).json({ error: "Please provide a description for the image." });
    }

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    });

    res.json({ imageBase64: response.data[0].b64_json });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Vite Integration ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
