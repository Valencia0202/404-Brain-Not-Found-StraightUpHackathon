````md
# Sage Step 🌿

Sage Step is a hint-only AI chatbot for students.  
It guides students with hints, questions, note summaries, and learning support without giving direct final answers.

## Features

- Hint-only academic chatbot
- Adjustable hint levels
- Tutor tone selection
- Notes summarisation
- File upload support for PDF, TXT, CSV, MD, and images
- Cheating-intent detection
- Calm minimalist student-friendly UI
- Fullscreen chat mode

## Tech Stack

- Node.js
- Express.js
- OpenAI API
- Render
- GitHub
- Multer
- pdf-parse

````

## Setup Steps

### 1. Clone The Repository


### 2. Install dependencies

```bash
npm install
```

### 3. Create environment variable

Create a `.env` file in the root folder:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 4. Run locally

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

## Deploy on Render

### 1. Push project to GitHub

Make sure these files are in your repo:

```text
server.js
package.json
```

### 2. Create a Render Web Service

Go to Render:

```text
New → Web Service
```

Connect your GitHub repository.

### 3. Render settings

Use these settings:

```text
Runtime: Node
Build Command: npm install
Start Command: node server.js
```

### 4. Add environment variable

In Render → Environment:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 5. Deploy

Click:

```text
Manual Deploy → Clear build cache & deploy
```

## Required package.json

```json
{
  "name": "sage-step",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.0.3",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "openai": "^4.0.0",
    "pdf-parse": "^1.1.1"
  }
}
```

## How to Use

1. Open the deployed Render link.
2. Choose a mode such as Study Help, Coding Help, Essay Help, Summarise Notes, or Quiz Me.
3. Type a question or upload notes.
4. Sage Step will guide the student using hints instead of direct answers.

## Project Purpose

Sage Step helps students learn independently in AI-heavy environments.
Instead of replacing student thinking, it supports human agency by encouraging reasoning, reflection, and active learning.


