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

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("La IA no devolvio JSON valido");
    return JSON.parse(match[0]);
  }
}

function normalizeItem(item: any) {
  const name = String(item?.name || item?.descripcion || item?.description || "").replace(/\s+/g, " ").trim();
  const code = String(item?.code || item?.codigo || "").replace(/\s+/g, " ").trim();
  const qtyValue = Number(String(item?.qty ?? item?.cantidad ?? 1).replace(",", "."));
  const qty = Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1;
  if (!name || name.length < 3) return null;
  return { name, code, category: "", qty };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return Response.json({ items: [], source: "missing-openai-key", detail: "Falta OPENAI_API_KEY en Supabase secrets." }, { headers: corsHeaders });
    }

    const payload = await request.json();
    const images: string[] = Array.isArray(payload.images) ? payload.images.filter(Boolean).slice(0, 3) : [];
    if (!images.length) {
      return Response.json({ items: [], source: "missing-images", detail: "No se recibieron imagenes para OCR." }, { status: 400, headers: corsHeaders });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_OCR_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Eres un OCR especializado en facturas chilenas de insumos de panol escolar. Extrae solo filas de productos desde tablas. No incluyas datos del cliente, proveedor, total, IVA, formas de pago, direcciones, RUT ni observaciones. Responde exclusivamente JSON valido."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Lee la factura escaneada y devuelve exactamente este formato: {\"items\":[{\"name\":\"descripcion del producto\",\"code\":\"codigo si aparece\",\"qty\":1}]}. Usa la columna Descripcion/Detalle para name y la columna Cantidad para qty. Si la cantidad no es clara usa 1. Maximo 40 items."
              },
              ...images.map((image) => ({ type: "input_image", image_url: image }))
            ]
          }
        ],
        temperature: 0
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      return Response.json({ items: [], source: "openai-error", detail }, { status: 200, headers: corsHeaders });
    }

    const data = await response.json();
    const parsed = parseJsonObject(readOutputText(data));
    const seen = new Set<string>();
    const items = (parsed.items || [])
      .map(normalizeItem)
      .filter(Boolean)
      .filter((item: any) => {
        const key = `${item.code.toLowerCase()}-${item.name.toLowerCase()}-${item.qty}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 40);

    return Response.json({ items, source: "openai-ocr" }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ items: [], source: "function-error", detail: String(error) }, { status: 200, headers: corsHeaders });
  }
});
