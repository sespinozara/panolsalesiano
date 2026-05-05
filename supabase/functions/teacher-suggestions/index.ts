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

function enrichItems(candidates: any[], availableInventory: InventoryItem[]) {
  return (candidates || [])
    .map((candidate: any) => {
      const byCode = availableInventory.find((item) => normalize(item.code || "") === normalize(candidate.code || ""));
      const byName = availableInventory.find((item) => normalize(item.name) === normalize(candidate.name || ""));
      const item = byCode || byName;
      return item ? { ...item, qty: Math.max(1, Number(candidate.qty) || 1) } : null;
    })
    .filter(Boolean);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return Response.json({ suggestions: [], lessonPlan: null, source: "missing-openai-key" }, { headers: corsHeaders });
    }

    const payload = await request.json();
    const mode = payload.mode || "suggestions";
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
    const isLessonPlan = mode === "lesson-plan";
    const systemPrompt = isLessonPlan
      ? "Eres asistente de un panol escolar tecnico. Debes preparar una propuesta de materiales para una clase usando SOLO items disponibles del inventario entregado. Prioriza primero materiales mencionados o implicados por la rubrica/guia, luego la descripcion de la clase, y finalmente el historial del docente. No sugieras items solo por departamento si no tienen relacion directa con la actividad. Responde exclusivamente JSON valido."
      : "Eres asistente de un panol escolar tecnico. Sugiere kits breves y utiles para un docente usando SOLO items disponibles del inventario entregado. Responde exclusivamente JSON valido.";
    const userPrompt = isLessonPlan
      ? `Datos:\n${JSON.stringify({ ...compactPayload, lessonPrompt: payload.lessonPrompt || "", rubricText: (payload.rubricText || "").slice(0, 6000) })}\n\nDevuelve este formato exacto: {"lessonPlan":{"title":"texto","summary":"texto breve","items":[{"code":"codigo inventario","name":"nombre inventario","qty":1}],"notes":["texto breve"]}}. Maximo 8 items. Las cantidades deben ser prudentes y no superar el stock disponible. Para instalacion domiciliaria considera elementos como conductores, canaletas, interruptores, enchufes, cajas, cinta aislante y herramientas manuales solo si existen en inventario.`
      : `Datos:\n${JSON.stringify(compactPayload)}\n\nDevuelve este formato exacto: {"suggestions":[{"id":"texto-corto","title":"texto","reason":"texto breve","items":[{"code":"codigo inventario","name":"nombre inventario","qty":1}]}]}. Maximo 3 sugerencias, maximo 5 items por sugerencia.`;

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
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
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
    if (isLessonPlan) {
      const plan = parsed.lessonPlan || {};
      const items = enrichItems(plan.items || [], availableInventory);
      return Response.json({
        lessonPlan: {
          title: plan.title || "Preparacion sugerida de clase",
          summary: plan.summary || "Propuesta generada con inventario disponible.",
          items,
          notes: Array.isArray(plan.notes) ? plan.notes.slice(0, 3) : []
        },
        source: "openai"
      }, { headers: corsHeaders });
    }
    const suggestions = (parsed.suggestions || []).map((suggestion: any) => ({
      id: suggestion.id || crypto.randomUUID(),
      title: suggestion.title || "Sugerencia inteligente",
      reason: suggestion.reason || "Basada en perfil, historial y stock disponible.",
      items: enrichItems(suggestion.items || [], availableInventory)
    })).filter((suggestion: any) => suggestion.items.length > 0);

    return Response.json({ suggestions, source: "openai" }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ suggestions: [], source: "function-error", detail: String(error) }, { status: 200, headers: corsHeaders });
  }
});
