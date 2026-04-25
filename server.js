import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import pdf from "pdf-parse";
import path from "path";
import { fileURLToPath } from "url";

import { classifyIntent } from "./ai/intent.js";
import { analyzeBehavior, classifyStudent } from "./ai/profiler.js";
import { validateOutput } from "./utils/validator.js";
import { resolveResponseLanguage } from "./ai/language.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const upload = multer({ storage: multer.memoryStorage() });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------- PROFILE STORE ----------------
global.studentProfiles = global.studentProfiles || {};

// ---------------- CORRECT ANSWER DETECTOR ----------------
async function checkIfCorrect(client, conversationHistory, latestMessage) {
  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
You are evaluating a tutoring conversation.
Look at the conversation history and the student's latest message.
Decide if the student has arrived at the correct final answer to the problem being discussed.

Return ONLY valid JSON:
{
  "isCorrect": true | false,
  "confidence": number (0-1)
}

Be strict: only return true if the student's answer is clearly correct and complete.
Do not return true for partial answers, close guesses, or process steps.
`
        },
        ...conversationHistory.slice(-6),
        {
          role: "user",
          content: `Student's latest message: "${latestMessage}"\n\nIs this the correct final answer?`
        }
      ]
    });

    const parsed = JSON.parse(res.choices[0].message.content);
    return { isCorrect: parsed.isCorrect === true && parsed.confidence >= 0.8 };
  } catch {
    return { isCorrect: false };
  }
}

// ---------------- HOME ----------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------- CHAT ----------------
app.post("/chat", async (req, res) => {
  try {
    const { message, hintLevel, personality, language } = req.body;
    const userKey = req.ip;

    if (!global.studentProfiles[userKey]) {
      global.studentProfiles[userKey] = {
        attempts: 0,
        hintRequests: 0,
        directAnswerRequests: 0,
        followUpDepth: 0,
        lastMessages: [],
        lastIntent: "learning",
        profile: "average",
        solvedQuestion: null,
        conversationHistory: [],
        settings: { language: "English", hintLevel: "1", personality: "friendly" }
      };
    }

    let profile = global.studentProfiles[userKey];

    const effectiveSettings = {
      ...profile.settings,
      ...(hintLevel ? { hintLevel } : {}),
      ...(personality ? { personality } : {}),
      ...(language ? { language } : {})
    };
    profile.settings = effectiveSettings;

    // ---------------- INTENT ----------------
    const intentData = await classifyIntent(client, message);
    const intent = intentData.intent;

    // ---------------- UPDATE PROFILE ----------------
    profile = analyzeBehavior(profile, message, intent);
    profile.profile = classifyStudent(profile);

    // ---------------- POLICY ----------------
    let policyMode = "normal";
    if (intent === "cheating" || intent === "verification") policyMode = "strict";
    if (profile.profile === "avoidant") policyMode = "strict";
    else if (profile.profile === "struggling") policyMode = "guided";
    else if (profile.profile === "engaged") policyMode = "socratic";

    // anti step-extraction abuse
    if (profile.followUpDepth > 5) {
      return res.json({ reply: "Try solving the next step yourself first. What do you think comes next?" });
    }

    // force attempt for avoidant users
    if (profile.profile === "avoidant") {
      const hasAttempt = message.toLowerCase().includes("i tried") || message.includes("=");
      if (!hasAttempt) {
        return res.json({ reply: "Give it a try first. What's your initial approach?" });
      }
    }

    // ---------------- LANGUAGE ----------------
    const responseLanguage = await resolveResponseLanguage(client, effectiveSettings.language, message);

    // ---------------- STORE CONVERSATION HISTORY ----------------
    if (!profile.conversationHistory) profile.conversationHistory = [];
    profile.conversationHistory.push({ role: "user", content: message });
    // keep last 10 turns
    if (profile.conversationHistory.length > 10) {
      profile.conversationHistory = profile.conversationHistory.slice(-10);
    }

    // ---------------- CHECK IF ANSWER IS CORRECT ----------------
    const correctnessCheck = await checkIfCorrect(client, profile.conversationHistory, message);

    if (correctnessCheck.isCorrect) {
      profile.followUpDepth = 0;

      const summaryResponse = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `
You are Sage Step, a warm AI tutor. The student has just arrived at the correct answer.

Your response must have exactly three parts, separated clearly:

1. A short congratulatory message (1-2 sentences, match personality: ${effectiveSettings.personality}).
2. Confirm the correct answer explicitly — state it clearly.
3. A "How we got there" step-by-step summary of the reasoning journey from this conversation. Number each step. Keep each step to one sentence. Maximum 6 steps.

Language: ${responseLanguage}

Format your response exactly like this:
🎉 [congratulation message]

✅ Answer: [the correct answer stated clearly]

🗺️ How we got there:
1. [step]
2. [step]
...
`
          },
          ...profile.conversationHistory
        ]
      });

      const reply = summaryResponse.choices[0].message.content;
      profile.conversationHistory.push({ role: "assistant", content: reply });

      return res.json({
        reply,
        meta: { intent, profile: profile.profile, policyMode, responseLanguage, correct: true }
      });
    }

    // ---------------- NORMAL GUIDING RESPONSE ----------------
    const systemPrompt = `
You are Sage Step, an AI tutor.

Core rule: Never give the final answer — guide the student to find it themselves.

Language: ${responseLanguage}
Hint level: ${effectiveSettings.hintLevel} (1=light nudge, 2=guided steps, 3=more scaffolding)
Personality: ${effectiveSettings.personality}
Policy mode: ${policyMode}
Student profile: ${profile.profile}

Rules:
- Guide thinking, do not solve
- Stop before the final answer
- Ask one reflective question at the end
- If the student's answer is close but wrong, acknowledge what they got right and nudge them toward what's off
`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        ...profile.conversationHistory
      ]
    });

    let reply = response.choices[0].message.content;

    const check = await validateOutput(client, reply);
    if (!check.safe) {
      reply = "Let's focus on the method. What step do you think comes next?";
    }

    profile.conversationHistory.push({ role: "assistant", content: reply });

    res.json({
      reply,
      meta: { intent, profile: profile.profile, policyMode, responseLanguage, correct: false }
    });

  } catch (err) {
    res.status(500).json({ reply: "Something went wrong.", error: err.message });
  }
});

// ---------------- UPLOAD ----------------
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
    res.status(500).json({ reply: "File upload failed.", error: err.message });
  }
});

// ---------------- SETTINGS GET ----------------
app.get("/settings", (req, res) => {
  const userKey = req.ip;
  const profile = global.studentProfiles[userKey];

  if (!profile) {
    return res.json({
      settings: { language: "English", hintLevel: "1", personality: "friendly" }
    });
  }

  res.json({ settings: profile.settings });
});

// ---------------- SETTINGS POST ----------------
app.post("/settings", async (req, res) => {
  const userKey = req.ip;

  if (!global.studentProfiles[userKey]) {
    global.studentProfiles[userKey] = {
      attempts: 0,
      hintRequests: 0,
      directAnswerRequests: 0,
      followUpDepth: 0,
      lastMessages: [],
      lastIntent: "learning",
      profile: "average",
      solvedQuestion: null,
      conversationHistory: [],
      settings: { language: "English", hintLevel: "1", personality: "friendly" }
    };
  }

  const profile = global.studentProfiles[userKey];
  const { language, hintLevel, personality, sampleMessage = "" } = req.body;

  const resolvedLanguage = await resolveResponseLanguage(
    client,
    language || profile.settings.language,
    sampleMessage
  );

  profile.settings = {
    language: resolvedLanguage,
    hintLevel: hintLevel || profile.settings.hintLevel,
    personality: personality || profile.settings.personality
  };

  res.json({
    message: "Settings updated successfully.",
    settings: profile.settings
  });
});

// ---------------- DASHBOARD DATA ----------------
app.get("/dashboard-data", (req, res) => {
  const users = Object.entries(global.studentProfiles).map(([userId, profile]) => ({
    userId,
    profile: profile.profile,
    intent: profile.lastIntent || "learning",
    policyMode:
      profile.profile === "avoidant" ? "strict"
      : profile.profile === "struggling" ? "guided"
      : profile.profile === "engaged" ? "socratic"
      : "normal",
    attempts: profile.attempts,
    hintRequests: profile.hintRequests,
    followUpDepth: profile.followUpDepth
  }));

  res.json({ totalUsers: users.length, users });
});

// ---------------- START SERVER ----------------
app.listen(process.env.PORT || 3000, () => {
  console.log("Advanced Sage Step AI running");
});
