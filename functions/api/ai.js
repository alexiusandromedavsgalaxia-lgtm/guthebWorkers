export async function onRequestPost({ request, env }) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Content-Type": "application/json"
  };

  try {
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body?.history) ? body.history.slice(-12) : [];

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required." }), { status: 400, headers: cors });
    }

    if (!env.POLLINATIONS_API_KEY) {
      return new Response(JSON.stringify({
        error: "POLLINATIONS_API_KEY is not configured.",
        provider: "pollinations"
      }), { status: 503, headers: cors });
    }

    const messages = [
      {
        role: "system",
        content: "You are GutHeb AI, the developer assistant inside the GutHeb platform. Be concise, practical and honest. Help with repository structure, code, README files, licenses, packages, issues, pull requests, workflows and Git concepts. Never claim an action was performed unless GutHeb actually performed it through a connected tool."
      },
      ...history.map(x => ({
        role: x.role === "user" ? "user" : "assistant",
        content: String(x.text || "")
      })),
      { role: "user", content: message }
    ];

    const upstream = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.POLLINATIONS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.POLLINATIONS_MODEL || "openai/gpt-5.4-nano",
        messages,
        temperature: 0.2
      })
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return new Response(JSON.stringify({
        error: "Pollinations provider error.",
        detail: detail.slice(0, 500)
      }), { status: 502, headers: cors });
    }

    const data = await upstream.json();
    const output = data?.choices?.[0]?.message?.content || "No response.";

    return new Response(JSON.stringify({
      output,
      provider: "pollinations"
    }), { status: 200, headers: cors });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid AI request." }), {
      status: 400,
      headers: cors
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}
