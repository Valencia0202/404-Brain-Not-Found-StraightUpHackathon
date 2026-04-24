export async function validateOutput(client, text) {
  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Return JSON:
{ "safe": true/false }

Unsafe if:
- gives final answer
- confirms correctness
- full solution
`
        },
        { role: "user", content: text }
      ]
    });

    return JSON.parse(res.choices[0].message.content);
  } catch {
    return { safe: true };
  }
}
