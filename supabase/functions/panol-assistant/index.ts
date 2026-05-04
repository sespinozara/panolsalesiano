const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function readOutputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  return (data?.output || [])
    .flatMap((item: any) => item?.content || [])
    .map((part: any) => part?.text || "")
    .join("\n")
    .trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return Response.json({ answer: null, source: "missing-openai-key" }, { headers: corsHeaders });
    }

    const payload = await request.json();
    const mode = payload.mode || "question";
    const question = payload.question || "";
    const context = payload.context || {};

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Eres asistente operativo de un panol escolar. Responde solo con JSON valido. Usa exclusivamente los datos entregados. Prioriza analisis de prestamos, herramientas fuera del panol, atrasos, personas bloqueadas y busqueda natural."
          },
          {
            role: "user",
            content:
              `Modo: ${mode}\nPregunta: ${question}\nContexto JSON:\n${JSON.stringify(context).slice(0, 120000)}\n\nDevuelve exactamente: {"answer":{"title":"texto","summary":"texto breve","bullets":["accion o hallazgo"],"tables":[{"title":"texto","rows":[{"campo":"valor"}]}]}}. Maximo 8 bullets y maximo 2 tablas con 8 filas cada una.`
          }
        ],
        temperature: 0.15
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      return Response.json({ answer: null, source: "openai-error", detail }, { status: 200, headers: corsHeaders });
    }

    const data = await response.json();
    const parsed = JSON.parse(readOutputText(data));
    return Response.json({ answer: parsed.answer, source: "openai" }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ answer: null, source: "function-error", detail: String(error) }, { status: 200, headers: corsHeaders });
  }
});
