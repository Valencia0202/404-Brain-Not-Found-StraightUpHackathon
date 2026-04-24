export async function resolveResponseLanguage(client, preferredLanguage, message) {
  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Return ONLY JSON:
{
  "language": "a natural language name"
}

Choose the best language for the tutor's response based on:
1) preferredLanguage (if provided)
2) the language used in the student's message

If preferredLanguage is missing/invalid, infer from the message language.
Do not return language codes; return readable names like English, Spanish, French, Arabic.
`
        },
        {
          role: "user",
          content: JSON.stringify({ preferredLanguage, message })
        }
      ]
    });

    const parsed = JSON.parse(res.choices[0].message.content);

    if (!parsed.language || typeof parsed.language !== "string") {
      return "English";
    }

    return parsed.language;
  } catch {
    return "English";
  }
}
