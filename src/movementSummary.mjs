export function buildMovementSummary(movement = {}, linkedLoan = null) {
  const requester = movement.requesterName || "Sin responsable";
  const type = movement.type || "movimiento";
  const action =
    type === "entrada"
      ? "devolvió"
      : type === "salida"
        ? "solicitó"
        : "registró";
  const items = Array.isArray(linkedLoan?.items) && linkedLoan.items.length
    ? linkedLoan.items.map((item) => `${item.name || "Item"} (${item.qty || 1})`).join(", ")
    : movement.detail || "Sin detalle";
  const status = movement.status ? ` · ${movement.status}` : "";

  return `${requester} ${action}: ${items}${status}`;
}
