const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function toRecipients(value: unknown) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return Response.json({ ok: false, error: "missing-resend-key", detail: "Falta configurar RESEND_API_KEY en Supabase." }, { headers: corsHeaders });
    }

    const payload = await request.json();
    const to = toRecipients(payload.to);
    const subject = String(payload.subject || "").trim();
    const text = String(payload.text || "").trim();
    const html = typeof payload.html === "string" ? payload.html.trim() : "";
    const from = Deno.env.get("RESEND_FROM") || "Pañol Central <onboarding@resend.dev>";
    const replyTo = Deno.env.get("RESEND_REPLY_TO") || "";

    if (!to.length || !subject || (!text && !html)) {
      return Response.json({ ok: false, error: "invalid-payload", detail: "Falta destinatario, asunto o contenido del correo." }, { headers: corsHeaders });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        ...(text ? { text } : {}),
        ...(html ? { html } : {}),
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json({ ok: false, error: "resend-error", status: response.status, detail: data }, { headers: corsHeaders });
    }

    return Response.json({ ok: true, id: data.id || null }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ ok: false, error: "function-error", detail: String(error) }, { headers: corsHeaders });
  }
});
