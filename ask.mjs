// Zan AI — прокси к Claude API. Ключ берётся из переменной окружения Netlify ANTHROPIC_API_KEY.
const MODEL = process.env.ZAN_MODEL || "claude-haiku-5-5";
const MAX_CHARS = 30000;

export default async (req) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") return Response.json({ ok: Boolean(key) });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const raw = Array.isArray(body.messages) ? body.messages.slice(-10) : [];

  // Склеиваем подряд идущие сообщения одной роли и ограничиваем размер
  const messages = [];
  let total = 0;
  for (const m of raw) {
    const role = m && m.role === "assistant" ? "assistant" : "user";
    const content = String((m && m.content) || "").slice(0, MAX_CHARS);
    total += content.length;
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += "\n\n" + content;
    else messages.push({ role, content });
  }
  if (!messages.length || messages[0].role !== "user" || total > MAX_CHARS * 2)
    return Response.json({ error: "invalid messages" }, { status: 400 });

  let upstream;
  try {
  upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: Math.min(Number(body.max_tokens) || 2000, 4000),
      messages,
      stream: true,
    }),
  });
  } catch (e) {
    return Response.json({ error: { message: "Cannot reach Claude API: " + e.message } }, { status: 502 });
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { "content-type": "application/json" } });
  }
  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
};

export const config = { path: "/api/ask" };
