const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type InventoryItem = {
  id: string;
  type: string;
  name: string;
  code?: string;
  category?: string;
  stock?: number;
  unit?: string;
  status?: string;
};

function normalize(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

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
      return Response.json({ suggestions: [], source: "missing-openai-key" }, { headers: corsHeaders });
    }

    const payload = await request.json();
    const inventory: InventoryItem[] = Array.isArray(payload.inventory) ? payload.inventory : [];
    const teacher = payload.teacher || {};
    const availableInventory = inventory
      .filter((item) => Number(item.stock ?? 0) > 0)
      .slice(0, 250);

    const compactPayload = {
      teacher,
      cart: payload.cart || [],
      recentRequests: (payload.recentRequests || []).slice(-8),
      inventory: availableInventory.map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        code: item.code,
        category: item.category,
        stock: item.stock,
        unit: item.unit,
        status: item.status
      }))
    };

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
              "Eres asistente de un panol escolar tecnico. Sugiere kits breves y utiles para un docente usando SOLO items disponibles del inventario entregado. Responde exclusivamente JSON valido."
          },
          {
            role: "user",
            content:
              `Datos:\n${JSON.stringify(compactPayload)}\n\nDevuelve este formato exacto: {"suggestions":[{"id":"texto-corto","title":"texto","reason":"texto breve","items":[{"code":"codigo inventario","name":"nombre inventario","qty":1}]}]}. Maximo 3 sugerencias, maximo 5 items por sugerencia.`
          }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      return Response.json({ suggestions: [], source: "openai-error", detail }, { status: 200, headers: corsHeaders });
    }

    const data = await response.json();
    const outputText = readOutputText(data);
    const parsed = JSON.parse(outputText);
    const suggestions = (parsed.suggestions || []).map((suggestion: any) => ({
      id: suggestion.id || crypto.randomUUID(),
      title: suggestion.title || "Sugerencia inteligente",
      reason: suggestion.reason || "Basada en perfil, historial y stock disponible.",
      items: (suggestion.items || [])
        .map((candidate: any) => {
          const byCode = availableInventory.find((item) => normalize(item.code || "") === normalize(candidate.code || ""));
          const byName = availableInventory.find((item) => normalize(item.name) === normalize(candidate.name || ""));
          const item = byCode || byName;
          return item ? { ...item, qty: Math.max(1, Number(candidate.qty) || 1) } : null;
        })
        .filter(Boolean)
    })).filter((suggestion: any) => suggestion.items.length > 0);

    return Response.json({ suggestions, source: "openai" }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ suggestions: [], source: "function-error", detail: String(error) }, { status: 200, headers: corsHeaders });
  }
});
