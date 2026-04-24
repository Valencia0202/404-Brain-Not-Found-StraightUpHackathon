export async function classifyIntent(client, message) {
  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Classify student intent.

Return ONLY JSON:
{
  "intent": "learning | cheating | verification | jailbreak",
  "confidence": number (0-1)
}
`
        },
        { role: "user", content: message }
      ]
    });

    return JSON.parse(res.choices[0].message.content);
  } catch {
    return { intent: "learning", confidence: 0.5 };
  }
}
