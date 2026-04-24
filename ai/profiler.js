export function analyzeBehavior(profile, message, intent) {
  const lower = message.toLowerCase();

  const showsAttempt =
    lower.includes("=") ||
    lower.includes("i tried") ||
    lower.includes("my answer") ||
    lower.includes("i think");

  if (showsAttempt) profile.attempts += 1;

  if (intent === "cheating" || intent === "verification") {
    profile.directAnswerRequests += 1;
  }

  if (lower.includes("hint") || lower.includes("help")) {
    profile.hintRequests += 1;
  }

  if (
    lower.includes("next") ||
    lower.includes("continue") ||
    lower.includes("what now")
  ) {
    profile.followUpDepth += 1;
  }

  profile.lastIntent = intent;
  profile.lastMessages.push(message);

  if (profile.lastMessages.length > 5) {
    profile.lastMessages.shift();
  }

  return profile;
}

export function classifyStudent(profile) {
  const {
    attempts,
    directAnswerRequests,
    hintRequests,
    followUpDepth
  } = profile;

  if (directAnswerRequests >= 2 && attempts === 0) {
    return "avoidant";
  }

  if (hintRequests >= 2 && attempts > 0) {
    return "struggling";
  }

  if (attempts >= 2 && directAnswerRequests === 0 && followUpDepth > 0) {
    return "engaged";
  }

  return "average";
}
