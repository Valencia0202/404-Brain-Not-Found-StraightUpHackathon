# 🌿 Sage Step

![Status](https://img.shields.io/badge/status-prototype-blue)
![Built With](https://img.shields.io/badge/built%20with-Node.js%20%7C%20Express%20%7C%20OpenAI-green)
![Focus](https://img.shields.io/badge/focus-Responsible%20AI-orange)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## 🧠 Tagline

**Guiding thinking, not giving answers.**

---

## 🚨 Problem

AI tools are making students **faster—but not smarter**.

* Students increasingly rely on AI for **instant answers**
* Leads to **shallow understanding** and **dependency**
* Existing tools optimize for **efficiency**, not **learning**

> Current AI = Answer engines
> **Sage Step = Thinking engine**

---

## 💡 Solution

Sage Step is a **hint-first AI learning assistant** that:

* Breaks problems into **guided steps**
* Uses **Socratic questioning**
* Actively **blocks answer-seeking behaviour**

Instead of replacing thinking, it **scaffolds it**.

---

## ✨ Key Features

### 🧠 Hint-Only Guidance

* No direct answers
* Step-by-step hints that adapt to user input

### 🎚 Adjustable Hint Levels

* Low → subtle nudges
* Medium → structured guidance
* High → near-complete breakdown (still no final answer)

### 🎭 Tutor Personalities

* Socratic (question-driven)
* Supportive (encouraging)
* Strict (challenge-focused)

### 📂 Smart File Input

Upload:

* PDFs
* Notes
* CSVs
* Images

→ Get summaries, breakdowns, and guided explanations

### 🚫 Cheating Intent Detection

* Detects prompts like:

  * “just give me the answer”
  * “skip steps”
* Redirects to learning flow instead

### 🧘 Minimalist UI

* Distraction-free
* Built for long study sessions

---

## 🏆 Why This Wins (USP)

* ✅ Aligns with **education ethics + responsible AI**
* ✅ Solves a **real, growing problem** (AI dependency)
* ✅ Clear behavioral differentiation from ChatGPT
* ✅ Easy to demo, easy to scale

> Sage Step doesn’t compete with AI tools — it **corrects how they’re used**.

---

## 🧪 Demo Flow (What Judges Will See)

**Scenario: Student asks a math question**

1. User inputs:

   > “Solve this equation: 2x + 5 = 13”

2. ❌ Instead of giving the answer
   ✅ Sage Step responds:

   * “What is the first step when isolating x?”
   * Provides hint progression

3. User tries to bypass:

   > “Just give me the answer”

4. 🚫 System detects intent:

   * Responds with:

     > “Let’s work through it together—what should we remove first?”

5. User uploads notes (PDF)

6. 📄 System:

   * Summarises content
   * Converts into guided prompts

👉 Result: **User learns, not just completes**

---

## 📸 Screenshots

> *(Replace with your actual images before submission)*

### 💬 Chat Interface

![Chat UI](./assets/chat-ui.png)

### 🎚 Hint Level Control

![Hint Levels](./assets/hint-levels.png)

### 📄 Notes Summarisation

![Summarisation](./assets/summarisation.png)

---

## 🛠 Tech Stack

**Backend**

* Node.js
* Express.js

**AI Layer**

* OpenAI API (prompt control + intent detection)

**File Processing**

* Multer
* pdf-parse

**Deployment**

* Render

**Version Control**

* GitHub

---

## ⚙️ Setup

```bash
git clone https://github.com/your-username/sage-step.git
cd sage-step
npm install
```

Create `.env`:

```env
OPENAI_API_KEY=your_api_key_here
PORT=5000
```

Run:

```bash
npm start
```

---

## 🧩 Architecture (Simplified)

```
User Input
   ↓
Intent Detection Layer (Cheating Filter)
   ↓
Prompt Engineering Layer (Hint Control)
   ↓
OpenAI API
   ↓
Structured Hint Response
```

---

## 🔮 Future Roadmap

* 📊 Real-time student learning analytics dashboard
* 🧠 Adaptive hinting using ML models
* 🏫 LMS / school integration
* 🎮 Gamified progress tracking
* 👩‍🏫 Teacher monitoring tools

---

## 👥 Team

*404 Brain Not Found*

---

## 📄 License

MIT License

---

## 🎯 Final Pitch Line

> In a world where AI gives answers instantly,
> **Sage Step teaches students how to think again.**

---

If you want, I can also:

* design your **hackathon pitch deck (slides + script)**
* or refine this into a **1-minute live demo script that guarantees impact**
