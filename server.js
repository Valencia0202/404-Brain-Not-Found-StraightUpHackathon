import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import pdf from "pdf-parse";

import { classifyIntent } from "./ai/intent.js";
import { analyzeBehavior, classifyStudent } from "./ai/profiler.js";
import { validateOutput } from "./utils/validator.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------- PROFILE STORE ----------------
global.studentProfiles = global.studentProfiles || {};

// ---------------- HOME ----------------
app.get("/", (req, res) => {
  res.send(`YOUR EXISTING HTML (UNCHANGED)`);
});

// ---------------- CHAT ----------------
app.post("/chat", async (req, res) => {
  try {
    const {
      message,
      hintLevel = "1",
      personality = "friendly",
      language = "en"
    } = req.body;

    const userKey = req.ip;

    // init profile
    if (!global.studentProfiles[userKey]) {
      global.studentProfiles[userKey] = {
        attempts: 0,
        hintRequests: 0,
        directAnswerRequests: 0,
        followUpDepth: 0,
        lastMessages: [],
        profile: "unknown"
      };
    }

    let profile = global.studentProfiles[userKey];

    // ---------------- INTENT ----------------
    const intentData = await classifyIntent(client, message);
    const intent = intentData.intent;

    // ---------------- UPDATE PROFILE ----------------
    profile = analyzeBehavior(profile, message, intent);
    profile.profile = classifyStudent(profile);

    // ---------------- POLICY ----------------
    let policyMode = "normal";

    if (intent === "cheating" || intent === "verification") {
      policyMode = "strict";
    }

    if (profile.profile === "avoidant") {
      policyMode = "strict";
    }

    // anti step-extraction abuse
    if (profile.followUpDepth > 5) {
      return res.json({
        reply: "Try solving the next step yourself first. What do you think comes next?"
      });
    }

    // force attempt for avoidant users
    if (profile.profile === "avoidant") {
      const hasAttempt =
        message.toLowerCase().includes("i tried") ||
        message.includes("=");

      if (!hasAttempt) {
        return res.json({
          reply: "Give it a try first. What’s your initial approach?"
        });
      }
    }

    // ---------------- SYSTEM PROMPT ----------------
    const systemPrompt = `
You are Sage Step, an AI tutor.

Core rule:
Never give final answers.

Language: ${language}
Hint level: ${hintLevel}
Personality: ${personality}

Policy mode: ${policyMode}
Student profile: ${profile.profile}

Rules:
- Guide thinking, do not solve
- Stop before final answer
- Ask reflective questions
`;

    // ---------------- AI RESPONSE ----------------
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    let reply = response.choices[0].message.content;

    // ---------------- OUTPUT VALIDATION ----------------
    const check = await validateOutput(client, reply);

    if (!check.safe) {
      reply = "Let’s focus on the method. What step do you think comes next?";
    }

    // ---------------- RESPONSE ----------------
    res.json({
      reply,
      meta: {
        intent,
        profile: profile.profile,
        policyMode
      }
    });

  } catch (err) {
    res.status(500).json({
      reply: "Something went wrong.",
      error: err.message
    });
  }
});

// ---------------- UPLOAD (UNCHANGED EXCEPT CLIENT USE) ----------------
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const mode = req.body.mode || "summarise";

    if (!file) {
      return res.status(400).json({ reply: "No file uploaded." });
    }

    let extractedText = "";

    if (file.mimetype === "application/pdf") {
      const data = await pdf(file.buffer);
      extractedText = data.text;

    } else if (
      file.mimetype.startsWith("text/") ||
      file.originalname.endsWith(".txt") ||
      file.originalname.endsWith(".md") ||
      file.originalname.endsWith(".csv")
    ) {
      extractedText = file.buffer.toString("utf-8");

    } else if (file.mimetype.startsWith("image/")) {
      const base64Image = file.buffer.toString("base64");

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
You are Sage Step.
If notes → summarise.
If question → give hints only.
`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse this image." },
              {
                type: "image_url",
                image_url: {
                  url: `data:${file.mimetype};base64,${base64Image}`
                }
              }
            ]
          }
        ]
      });

      return res.json({ reply: response.choices[0].message.content });
    }

    const prompt =
      mode === "summarise"
        ? `
Summarise:
1. Key points
2. Terms
3. Simple explanation
4. Quiz questions

${extractedText}
`
        : `
Guide only, do not solve:

${extractedText}
`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: `
You are Sage Step.
Never give final answers.
Only guide learning.
`
        },
        { role: "user", content: prompt }
      ]
    });

    res.json({ reply: response.choices[0].message.content });

  } catch (err) {
    res.status(500).json({
      reply: "File upload failed.",
      error: err.message
    });
  }
});

// ---------------- START SERVER ----------------
app.listen(process.env.PORT || 3000, () => {
  console.log("Advanced Sage Step AI running");
});
