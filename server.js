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

function createDefaultProfile() {
  return {
    attempts: 0,
    hintRequests: 0,
    directAnswerRequests: 0,
    followUpDepth: 0,
    lastMessages: [],
    lastIntent: "learning",
    profile: "average",
    activeQuestion: "",
    chatHistory: [],
    settings: {
      language: "English",
      hintLevel: "1",
      personality: "friendly",
    },
  };
}

function getProfile(userKey) {
  if (!global.studentProfiles[userKey]) {
    global.studentProfiles[userKey] = createDefaultProfile();
  }

  return global.studentProfiles[userKey];
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (item) =>
        item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim()
    )
    .map((item) => ({
      role: item.role,
      content: item.content.trim(),
    }))
    .slice(-12);
}

function isLikelyContinuation(text) {
  const lower = text.toLowerCase().trim();

  if (!lower) {
    return false;
  }

  const continuationPhrases = [
    "minus",
    "plus",
    "divide",
    "times",
    "multiply",
    "move",
    "then",
    "next",
    "what next",
    "is this right",
    "i got",
    "my step",
    "i tried",
    "subtract",
    "add",
    "factor",
    "expand",
    "simplify",
    "differentiate",
    "integrate",
  ];

  return (
    lower.length <= 80 ||
    continuationPhrases.some((phrase) => lower.includes(phrase))
  );
}

function isExplicitNewQuestion(text) {
  const lower = text.toLowerCase().trim();

  if (!lower) {
    return false;
  }

  const explicitSwitches = [
    "new question",
    "another question",
    "different question",
    "new problem",
    "another problem",
    "different problem",
  ];

  if (explicitSwitches.some((phrase) => lower.includes(phrase))) {
    return true;
  }

  if (isLikelyContinuation(lower)) {
    return false;
  }

  return (
    lower.includes("=") ||
    lower.includes("?") ||
    /^(solve|find|explain|help me|how do i|what is|write|debug|prove|calculate|summarise|summarize)\b/.test(
      lower
    )
  );
}

function buildConversationWindow(profileHistory, incomingHistory, latestMessage) {
  const baseHistory =
    incomingHistory.length > 0 ? incomingHistory : sanitizeHistory(profileHistory);

  const nextHistory = [...baseHistory];
  const trimmedMessage = typeof latestMessage === "string" ? latestMessage.trim() : "";

  if (trimmedMessage) {
    const lastTurn = nextHistory[nextHistory.length - 1];

    if (
      !lastTurn ||
      lastTurn.role !== "user" ||
      lastTurn.content !== trimmedMessage
    ) {
      nextHistory.push({ role: "user", content: trimmedMessage });
    }
  }

  return nextHistory.slice(-12);
}

function resolveActiveQuestion(existingActiveQuestion, history) {
  const userTurns = history.filter((item) => item.role === "user");

  if (userTurns.length === 0) {
    return existingActiveQuestion || "";
  }

  const latestUserTurn = userTurns[userTurns.length - 1].content;

  if (!existingActiveQuestion) {
    const firstProblemTurn =
      userTurns.find((item) => isExplicitNewQuestion(item.content)) || userTurns[0];
    return firstProblemTurn.content;
  }

  if (isExplicitNewQuestion(latestUserTurn)) {
    return latestUserTurn;
  }

  return existingActiveQuestion;
}

function buildSystemPrompt({
  responseLanguage,
  hintLevel,
  personality,
  policyMode,
  profileType,
  activeQuestion,
}) {
  const activeQuestionBlock = activeQuestion
    ? `Active question:
${activeQuestion}

Anchoring rules:
- Treat short student replies as continuation of the active question unless they clearly start a new problem.
- Never ask the student to repeat the original question if the active question or recent history already contains it.
- Use the active question to interpret short replies like "minus 20", "divide by 2", "what next", or "is this right".
- Respond only to the next step on this active question.`
    : `Anchoring rules:
- If a question appears in the recent chat history, keep using it as the active question.
- Only ask the student to restate the problem if no earlier question exists in the provided context.`;

  return `
You are Sage Step, an AI tutor.

Core rule:
Never give final answers.

Language: ${responseLanguage}
Hint level: ${hintLevel}
Personality: ${personality}

Policy mode: ${policyMode}
Student profile: ${profileType}

${activeQuestionBlock}

Rules:
- Guide thinking, do not solve.
- Stop before the final answer unless the student has clearly completed the full solution on their own.
- If the student has already shown the full solving process or reached the final step independently, you may briefly confirm whether their final answer is correct.
- When confirming, do not add new solving steps unless the student asks for them.
- Do not confirm guessed answers without shown work or prior steps in context.
- Ask reflective questions unless the student is only asking for answer-checking after finishing.
- Give one small next step at a time.
- Keep the reply concise and centered on the active question
`;
}

// ---------------- PROFILE STORE ----------------
global.studentProfiles = global.studentProfiles || {};

// ---------------- HOME ----------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------- CHAT ----------------
app.post("/chat", async (req, res) => {
  try {
    const { message, history, hintLevel, personality, language } = req.body;

    const trimmedMessage = typeof message === "string" ? message.trim() : "";

    if (!trimmedMessage) {
      return res.status(400).json({ reply: "Please send a message first." });
    }

    const userKey = req.ip;
    let profile = getProfile(userKey);

    const effectiveSettings = {
      ...profile.settings,
      ...(hintLevel ? { hintLevel } : {}),
      ...(personality ? { personality } : {}),
      ...(language ? { language } : {}),
    };

    profile.settings = effectiveSettings;

    // ---------------- INTENT ----------------
    const intentData = await classifyIntent(client, trimmedMessage);
    const intent = intentData.intent;

    // ---------------- UPDATE PROFILE ----------------
    profile = analyzeBehavior(profile, trimmedMessage, intent);
    profile.profile = classifyStudent(profile);

    // ---------------- POLICY ----------------
    let policyMode = "normal";
    
    if (intent === "cheating") {
      policyMode = "strict";
    } else if (intent === "verification") {
      policyMode = "guided";
    }
    
    if (profile.profile === "avoidant" && intent !== "verification") {
      policyMode = "strict";
    } else if (profile.profile === "struggling") {
      policyMode = "guided";
    } else if (profile.profile === "engaged") {
      policyMode = "socratic";
    }


    // anti step-extraction abuse
    if (profile.followUpDepth > 5) {
      return res.json({
        reply: "Try solving the next step yourself first. What do you think comes next?",
      });
    }

    // force attempt for avoidant users
    if (profile.profile === "avoidant") {
      const hasAttempt =
        trimmedMessage.toLowerCase().includes("i tried") || trimmedMessage.includes("=");

      if (!hasAttempt) {
        return res.json({
          reply: "Give it a try first. What’s your initial approach?",
        });
      }
    }

    // ---------------- CONTEXT ANCHORING ----------------
    const incomingHistory = sanitizeHistory(history);
    const conversationWindow = buildConversationWindow(
      profile.chatHistory,
      incomingHistory,
      trimmedMessage
    );

    profile.activeQuestion = resolveActiveQuestion(
      profile.activeQuestion,
      conversationWindow
    );

    // ---------------- SYSTEM PROMPT ----------------
    const responseLanguage = await resolveResponseLanguage(
      client,
      effectiveSettings.language,
      trimmedMessage
    );

    const systemPrompt = buildSystemPrompt({
      responseLanguage,
      hintLevel: effectiveSettings.hintLevel,
      personality: effectiveSettings.personality,
      policyMode,
      profileType: profile.profile,
      activeQuestion: profile.activeQuestion,
    });

    // ---------------- AI RESPONSE ----------------
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "developer", content: systemPrompt },
        ...conversationWindow,
      ],
    });

    let reply = response.choices[0].message.content;

    // ---------------- OUTPUT VALIDATION ----------------
    const check = await validateOutput(client, reply);

    const recentUserTurns = conversationWindow
      .filter((item) => item.role === "user")
      .map((item) => item.content.toLowerCase());
    
    const hasShownWorkInContext =
      recentUserTurns.length >= 2 ||
      recentUserTurns.some((text) => text.includes("="));
    
    const isAllowedConfirmation =
      intent === "verification" &&
      !!profile.activeQuestion &&
      hasShownWorkInContext &&
      /correct|that'?s right|yes[, ]|yes\.|well done|nice work|exactly/i.test(reply);
    
    if (!check.safe && !isAllowedConfirmation) {
      reply = "Let’s focus on the method. What step do you think comes next?";
    }


    // ---------------- SAVE CONTEXT ----------------
    profile.chatHistory = [
      ...conversationWindow,
      { role: "assistant", content: reply },
    ].slice(-14);

    global.studentProfiles[userKey] = profile;

    // ---------------- RESPONSE ----------------
    res.json({
      reply,
      meta: {
        intent,
        profile: profile.profile,
        policyMode,
        responseLanguage,
        activeQuestion: profile.activeQuestion,
      },
    });
  } catch (err) {
    res.status(500).json({
      reply: "Something went wrong.",
      error: err.message,
    });
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
If notes -> summarise.
If question -> give hints only.
`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse this image." },
              {
                type: "image_url",
                image_url: {
                  url: `data:${file.mimetype};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
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
`,
        },
        { role: "user", content: prompt },
      ],
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    res.status(500).json({
      reply: "File upload failed.",
      error: err.message,
    });
  }
});

// ---------------- SETTINGS ----------------
app.get("/settings", (req, res) => {
  const userKey = req.ip;
  const profile = global.studentProfiles[userKey];

  if (!profile) {
    return res.json({
      settings: {
        language: "English",
        hintLevel: "1",
        personality: "friendly",
      },
    });
  }

  res.json({ settings: profile.settings });
});

app.post("/settings", async (req, res) => {
  const userKey = req.ip;
  const profile = getProfile(userKey);
  const { language, hintLevel, personality, sampleMessage = "" } = req.body;

  const resolvedLanguage = await resolveResponseLanguage(
    client,
    language || profile.settings.language,
    sampleMessage
  );

  profile.settings = {
    language: resolvedLanguage,
    hintLevel: hintLevel || profile.settings.hintLevel,
    personality: personality || profile.settings.personality,
  };

  res.json({
    message: "Settings updated successfully.",
    settings: profile.settings,
  });
});

// ---------------- DASHBOARD DATA ----------------
app.get("/dashboard-data", (req, res) => {
  const users = Object.entries(global.studentProfiles).map(([userId, profile]) => ({
    userId,
    profile: profile.profile,
    intent: profile.lastIntent || "learning",
    policyMode:
      profile.profile === "avoidant"
        ? "strict"
        : profile.profile === "struggling"
          ? "guided"
          : profile.profile === "engaged"
            ? "socratic"
            : "normal",
    attempts: profile.attempts,
    hintRequests: profile.hintRequests,
    followUpDepth: profile.followUpDepth,
  }));

  res.json({
    totalUsers: users.length,
    users,
  });
});

// ---------------- START SERVER ----------------
app.listen(process.env.PORT || 3000, () => {
  console.log("Advanced Sage Step AI running");
});
