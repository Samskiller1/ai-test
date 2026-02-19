import express from "express";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
const PORT = 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/jointhub";
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- MongoDB Setup ---
mongoose.connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

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

// --- Gemini Setup ---
if (!GEMINI_API_KEY) {
  console.error("FATAL: GEMINI_API_KEY not set.");
}
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "" });

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

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};

// --- API Routes ---

// Auth
app.post("/api/auth/register", async (req, res) => {
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

app.post("/api/auth/login", async (req, res) => {
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
app.get("/api/chat/history", authenticateToken, async (req: any, res) => {
  try {
    const chat = await Chat.findOne({ userId: req.user.id });
    res.json(chat ? chat.messages : []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat/save", authenticateToken, async (req: any, res) => {
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

app.post("/api/chat/clear", authenticateToken, async (req: any, res) => {
  try {
    await Chat.deleteOne({ userId: req.user.id });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Gemini Text
app.post("/api/generate-text", async (req, res) => {
  try {
    const { contents, systemInstruction } = req.body;
    const model = genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: systemInstruction?.parts?.[0]?.text || "",
        temperature: 0.7,
      },
    });
    const response = await model;
    res.json({
      candidates: [{
        content: {
          parts: [{ text: response.text }]
        }
      }]
    });
  } catch (error: any) {
    console.error("Text Gen Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Gemini Image
app.post("/api/generate-image", async (req, res) => {
  try {
    const { instances } = req.body;
    const prompt = instances[0]?.prompt;
    if (!prompt) return res.status(400).json({ error: "Prompt required" });

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ text: prompt }],
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!imagePart) return res.status(500).json({ error: "No image generated" });

    res.json({ imageBase64: imagePart.inlineData.data });
  } catch (error: any) {
    console.error("Image Gen Error:", error);
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
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
