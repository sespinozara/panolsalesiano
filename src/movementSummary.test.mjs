import test from "node:test";
import assert from "node:assert/strict";
import { buildMovementSummary } from "./movementSummary.mjs";

test("buildMovementSummary shows requester, movement type, items and status", () => {
  const movement = {
    type: "salida",
    detail: "PRE-2026-0221 · Prestamo 1 item(s)",
    requesterName: "CRISTIAN ANDRES CARRASCO SEPULVEDA",
    status: "activo"
  };
  const loan = {
    items: [{ name: "CAUTIN GENERICO", qty: 1 }]
  };

  assert.equal(
    buildMovementSummary(movement, loan),
    "CRISTIAN ANDRES CARRASCO SEPULVEDA solicitó: CAUTIN GENERICO (1) · activo"
  );
});

test("buildMovementSummary falls back to the movement detail when items are not linked", () => {
  assert.equal(
    buildMovementSummary({ type: "entrada", detail: "Factura Stereo Vision", requesterName: "Proveedor" }),
    "Proveedor devolvió: Factura Stereo Vision"
  );
});
