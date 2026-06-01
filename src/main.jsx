import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  FileCheck,
  Gauge,
  GraduationCap,
  Hammer,
  History,
  Inbox,
  KeyRound,
  MessageSquare,
  LayoutDashboard,
  LogOut,
  Moon,
  PackagePlus,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserRound,
  UserCog,
  UsersRound,
  Wand2,
  X
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import "./styles.css";

const STORAGE_KEY = "panol-educativo-state-v1";
const PORTAL_SESSION_KEY = "panol-portal-teacher-session";
const APP_SESSION_KEY = "panol-main-session";
const APP_VERSION = "v1.0.0";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const permissionOptions = [
  ["dashboard", "Dashboard"],
  ["alerts", "Centro de alertas"],
  ["people", "Personas"],
  ["inventory", "Inventario"],
  ["keys", "Control de llaves"],
  ["workshop", "Reservas taller"],
  ["loans", "Entrega y recepción"],
  ["requests", "Solicitudes docentes"],
  ["messages", "Mensajes"],
  ["assistant", "Asistente IA"],
  ["audit", "Bitácora"],
  ["invoices", "Facturas"],
  ["database", "Bases de datos"],
  ["reports", "Reportes"],
  ["settings", "Ajustes y perfiles"]
];
const allPermissions = permissionOptions.map(([key]) => key);
const recoveryAdminEmail = import.meta.env.VITE_ADMIN_EMAIL || "sespinozar@salesianoconcepcion.cl";
const defaultAdminUser = { id: "admin-panol", name: "Administrador Pañol", username: "panol", email: recoveryAdminEmail, password: "panol2026", role: "administrador", permissions: allPermissions, active: true };
const getAppUsers = (state) => {
  const stored = state.appUsers || [];
  const withoutDuplicateAdmin = stored.filter((user) => user.id !== "admin-panol" && normalizeHeader(user.username) !== "panol");
  return [defaultAdminUser, ...withoutDuplicateAdmin];
};

const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
const today = () => new Date().toISOString().slice(0, 10);
const asArray = (value) => Array.isArray(value) ? value : value ? [value] : [];
const normalizeRut = (value = "") => String(value).toUpperCase().replace(/[^0-9K]/g, "");
const folioYear = (date = today()) => String(date || today()).slice(0, 4);
const nextFolio = (items, prefix, date = today()) => {
  const year = folioYear(date);
  const marker = `${prefix}-${year}-`;
  const max = (items || []).reduce((highest, item) => {
    const folio = String(item.folio || "");
    if (!folio.startsWith(marker)) return highest;
    const number = Number(folio.slice(marker.length));
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);
  return `${marker}${String(max + 1).padStart(4, "0")}`;
};
const nextFolios = (items, prefix, count = 1, date = today()) => {
  const year = folioYear(date);
  const marker = `${prefix}-${year}-`;
  const max = (items || []).reduce((highest, item) => {
    const folio = String(item.folio || "");
    if (!folio.startsWith(marker)) return highest;
    const number = Number(folio.slice(marker.length));
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);
  return Array.from({ length: count }, (_, index) => `${marker}${String(max + index + 1).padStart(4, "0")}`);
};
const displayFolio = (item, prefix) => item?.folio || `${prefix}-${folioYear(item?.createdAt)}-${String(item?.id || "0000").slice(-4).toUpperCase()}`;
const rutFromPhotoFileName = (name = "") => {
  const compact = normalizeRut(String(name).replace(/\.[^.]+$/, ""));
  const match = compact.match(/\d{7,8}[0-9K]?/);
  return match?.[0] || "";
};
const courseFromPhotoPath = (path = "") => {
  const parts = String(path).split(/[\\/]/).filter(Boolean);
  return (parts.length > 1 ? parts[parts.length - 2] : "").replace(/\s+/g, " ").trim();
};
const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});
const loadBrowserImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});
const resizeStudentPhoto = async (file) => {
  const source = await readFileAsDataUrl(file);
  const image = await loadBrowserImage(source);
  const maxWidth = 150;
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
};
const STUDENT_PHOTO_DB = "panol-student-photos";
const STUDENT_PHOTO_STORE = "photos";
const openStudentPhotoDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(STUDENT_PHOTO_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STUDENT_PHOTO_STORE);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const saveStudentPhoto = async (key, photoUrl) => {
  const db = await openStudentPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STUDENT_PHOTO_STORE, "readwrite");
    tx.objectStore(STUDENT_PHOTO_STORE).put(photoUrl, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};
const getStudentPhoto = async (key) => {
  if (!key) return "";
  const db = await openStudentPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STUDENT_PHOTO_STORE, "readonly");
    const request = tx.objectStore(STUDENT_PHOTO_STORE).get(key);
    request.onsuccess = () => resolve(request.result || "");
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
};
const studentPhotoKey = (rut) => `student-photo-${normalizeRut(rut)}`;
const stripHeavyStudentPhotos = (state) => ({
  ...state,
  students: (state.students || []).map(({ photoUrl, ...student }) => student)
});
const addDays = (n) => {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return date.toISOString().slice(0, 10);
};
const formatDate = (date) => new Intl.DateTimeFormat("es-CL").format(new Date(`${date}T12:00:00`));
const overdueDays = (dueDate) => Math.max(0, Math.ceil((new Date(today()) - new Date(dueDate)) / 86400000));
const isOverdue = (loan) => loan.status === "activo" && loan.expectedReturn < today();
const personKey = (type, id) => `${type}:${id}`;
const isCriticalStockItem = (item) => {
  const category = normalizeHeader(item?.category || "");

  const isFungible =
    category.includes("fungible") ||
    category.includes("material fungible");

  return (
    isFungible &&
    item?.criticalEnabled !== false &&
    Number(item.stock || 0) < Number(item.minStock || 0)
  );
};

const isFungibleStockCategory = (item) => {
  const category = normalizeHeader(item?.category || "");

  return (
    category.includes("fungible") ||
    category.includes("material fungible")
  );
};

const isFungibleMaterial = (item) => {
  return item?.type === "material" && normalizeHeader(item.category || "").includes("fungible");
};

const getBlockReason = (loans, requesterType, requesterId) => {
  if (requesterType === "teacher") return "";
  const pending = loans.find((loan) => loan.status === "activo" && personKey(loan.requesterType, loan.requesterId) === personKey(requesterType, requesterId) && (loan.partialReturn || isOverdue(loan)));
  if (!pending) return "";
  if (pending.partialReturn) return `Bloqueado por devolución parcial pendiente del ${formatDate(pending.returnedAt || pending.createdAt)}.`;
  return `Bloqueado por préstamo vencido desde ${formatDate(pending.expectedReturn)} (${overdueDays(pending.expectedReturn)} días de atraso).`;
};

const getPendingLoanNotice = (loans, requesterType, requesterId) => {
  const pending = loans.find((loan) => loan.status === "activo" && personKey(loan.requesterType, loan.requesterId) === personKey(requesterType, requesterId) && (loan.partialReturn || isOverdue(loan)));
  if (!pending) return "";
  if (pending.partialReturn) return `Tiene una devolucion parcial pendiente desde el ${formatDate(pending.returnedAt || pending.createdAt)}.`;
  return `Tiene un prestamo vencido desde ${formatDate(pending.expectedReturn)} (${overdueDays(pending.expectedReturn)} dias de atraso).`;
};

const seed = {
  settings: { criticalThreshold: 5 },
  students: [
    ["Sofía Araya", "21.341.552-8", "Electricidad 3A", "sofia.araya@liceo.cl", "+56 9 7123 4401"],
    ["Martín Vega", "20.884.120-1", "Mecánica 2B", "martin.vega@liceo.cl", "+56 9 8123 1990"],
    ["Valentina Rojas", "22.090.441-6", "Construcción 4A", "valentina.rojas@liceo.cl", "+56 9 6754 2109"],
    ["Benjamín Soto", "19.751.304-9", "Electrónica 4B", "benjamin.soto@liceo.cl", "+56 9 6120 7888"],
    ["Isidora Pavez", "21.890.003-2", "Diseño Industrial 2A", "isidora.pavez@liceo.cl", "+56 9 9011 7745"],
    ["Tomás Muñoz", "20.110.901-5", "Mecánica 3A", "tomas.munoz@liceo.cl", "+56 9 7890 4422"],
    ["Antonia Leiva", "22.201.332-4", "Electricidad 1B", "antonia.leiva@liceo.cl", "+56 9 5544 8821"],
    ["Joaquín Cárdenas", "21.002.144-K", "Construcción 3B", "joaquin.cardenas@liceo.cl", "+56 9 6001 1220"],
    ["Camila Torres", "20.765.003-7", "Electrónica 2A", "camila.torres@liceo.cl", "+56 9 8444 1007"],
    ["Diego Herrera", "19.908.667-3", "Mecánica 4A", "diego.herrera@liceo.cl", "+56 9 7330 1122"]
  ].map(([name, rut, course, email, phone]) => ({ id: uid("alu"), name, rut, course, email, phone })),
  teachers: [
    ["Paula Contreras", "13.450.772-2", "Electricidad", "paula.contreras@liceo.cl"],
    ["Rodrigo Silva", "12.778.991-8", "Mecánica", "rodrigo.silva@liceo.cl"],
    ["Marcela Fuentes", "14.113.445-0", "Construcción", "marcela.fuentes@liceo.cl"],
    ["Andrés Vidal", "15.018.902-4", "Electrónica", "andres.vidal@liceo.cl"],
    ["Carolina Reyes", "11.441.008-1", "Prevención de Riesgos", "carolina.reyes@liceo.cl"]
  ].map(([name, rut, department, email]) => ({ id: uid("pro"), name, rut, department, email })),
  materials: [
    ["Tornillos autoperforantes", "MAT-001", "Fijaciones", 240, 50, "un", "Estante A1"],
    ["Cables THHN 2.5mm", "MAT-002", "Eléctrico", 18, 25, "m", "Rack E2"],
    ["Guantes anticorte", "MAT-003", "EPP", 32, 20, "par", "Gabinete S1"],
    ["Lentes de seguridad", "MAT-004", "EPP", 7, 15, "un", "Gabinete S2"],
    ["Brocas metal 6mm", "MAT-005", "Consumibles", 46, 12, "un", "Cajonera B3"],
    ["Brocas madera 8mm", "MAT-006", "Consumibles", 11, 10, "un", "Cajonera B3"],
    ["Cinta aisladora", "MAT-007", "Eléctrico", 54, 20, "rollo", "Rack E1"],
    ["Terminales eléctricos", "MAT-008", "Eléctrico", 330, 100, "un", "Rack E3"],
    ["Mascarillas polvo", "MAT-009", "EPP", 5, 30, "un", "Gabinete S1"],
    ["Lija grano 120", "MAT-010", "Terminaciones", 75, 25, "hoja", "Estante C2"],
    ["Silicona neutra", "MAT-011", "Sellantes", 9, 12, "cartucho", "Estante C4"],
    ["Pernos hexagonales", "MAT-012", "Fijaciones", 140, 60, "un", "Estante A2"],
    ["Tuercas M8", "MAT-013", "Fijaciones", 180, 80, "un", "Estante A2"],
    ["Amarras plásticas", "MAT-014", "Eléctrico", 260, 100, "un", "Rack E1"],
    ["Discos de corte", "MAT-015", "Consumibles", 13, 20, "un", "Cajonera B1"],
    ["Electrodos 6013", "MAT-016", "Soldadura", 28, 15, "kg", "Zona soldadura"],
    ["Pintura esmalte gris", "MAT-017", "Pintura", 6, 8, "lt", "Bodega P1"],
    ["Cable UTP Cat6", "MAT-018", "Redes", 70, 40, "m", "Rack R1"],
    ["Conectores RJ45", "MAT-019", "Redes", 120, 50, "un", "Rack R2"],
    ["Protectores auditivos", "MAT-020", "EPP", 14, 20, "un", "Gabinete S3"]
  ].map(([name, code, category, stock, minStock, unit, location]) => ({ id: uid("mat"), name, code, category, stock, minStock, unit, location })),
  tools: [
    ["Taladro percutor Bosch", "HER-001", "en préstamo", "Taladro 13mm con maletín"],
    ["Metro láser Stanley", "HER-002", "disponible", "Medidor láser 30m"],
    ["Esmeril angular 4.5", "HER-003", "en reparación", "Requiere cambio de carbones"],
    ["Multímetro digital", "HER-004", "en préstamo", "Multímetro autorango"],
    ["Llave torque", "HER-005", "disponible", "Rango 20-120 Nm"],
    ["Sierra caladora", "HER-006", "disponible", "Caladora orbital"],
    ["Prensa banco", "HER-007", "disponible", "Prensa portátil 4 pulgadas"],
    ["Remachadora manual", "HER-008", "en préstamo", "Incluye boquillas"],
    ["Pistola silicona", "HER-009", "disponible", "Aplicador estándar"],
    ["Crimpadora RJ45", "HER-010", "disponible", "Para conectores 8P8C"]
  ].map(([name, code, status, description]) => ({ id: uid("her"), name, code, status, description })),
  loans: [],
  invoices: [],
  movements: []
};

const materialByCode = (code) => seed.materials.find((m) => m.code === code);
const toolByCode = (code) => seed.tools.find((t) => t.code === code);
seed.loans = [
  {
    id: uid("pre"),
    requesterType: "student",
    requesterId: seed.students[0].id,
    requesterName: seed.students[0].name,
    createdAt: addDays(-8),
    expectedReturn: addDays(3),
    status: "activo",
    notes: "Proyecto tablero didáctico",
    items: [{ type: "material", id: materialByCode("MAT-002").id, name: "Cables THHN 2.5mm", code: "MAT-002", qty: 6 }]
  },
  {
    id: uid("pre"),
    requesterType: "student",
    requesterId: seed.students[3].id,
    requesterName: seed.students[3].name,
    createdAt: addDays(-12),
    expectedReturn: addDays(-2),
    status: "activo",
    notes: "Laboratorio mediciones",
    items: [{ type: "tool", id: toolByCode("HER-004").id, name: "Multímetro digital", code: "HER-004", qty: 1 }]
  },
  {
    id: uid("pre"),
    requesterType: "teacher",
    requesterId: seed.teachers[1].id,
    requesterName: seed.teachers[1].name,
    createdAt: addDays(-4),
    expectedReturn: addDays(7),
    status: "activo",
    notes: "Clase de montaje",
    items: [{ type: "tool", id: toolByCode("HER-008").id, name: "Remachadora manual", code: "HER-008", qty: 1 }]
  },
  {
    id: uid("pre"),
    requesterType: "student",
    requesterId: seed.students[5].id,
    requesterName: seed.students[5].name,
    createdAt: addDays(-20),
    expectedReturn: addDays(-5),
    status: "activo",
    notes: "Práctica taller",
    items: [{ type: "tool", id: toolByCode("HER-001").id, name: "Taladro percutor Bosch", code: "HER-001", qty: 1 }]
  },
  {
    id: uid("pre"),
    requesterType: "teacher",
    requesterId: seed.teachers[0].id,
    requesterName: seed.teachers[0].name,
    createdAt: addDays(-2),
    expectedReturn: addDays(5),
    status: "activo",
    notes: "Reposición módulo seguridad",
    items: [{ type: "material", id: materialByCode("MAT-004").id, name: "Lentes de seguridad", code: "MAT-004", qty: 4 }]
  }
];
seed.invoices = [
  { id: uid("fac"), date: addDays(-24), provider: "Suministros Técnicos Norte", invoiceNumber: "1832", itemsCount: 6, documentName: "factura-1832.pdf" },
  { id: uid("fac"), date: addDays(-10), provider: "Ferretería Industrial Sur", invoiceNumber: "2190", itemsCount: 4, documentName: "factura-2190.jpg" }
];
seed.movements = [
  { id: uid("mov"), date: addDays(-1), type: "salida", detail: "Préstamo lentes de seguridad", requesterName: seed.teachers[0].name, status: "activo" },
  { id: uid("mov"), date: addDays(-2), type: "salida", detail: "Préstamo remachadora manual", requesterName: seed.teachers[1].name, status: "activo" },
  { id: uid("mov"), date: addDays(-4), type: "entrada", detail: "Factura Ferretería Industrial Sur", requesterName: "Proveedor", status: "importado" },
  { id: uid("mov"), date: addDays(-8), type: "salida", detail: "Préstamo cables THHN", requesterName: seed.students[0].name, status: "activo" },
  { id: uid("mov"), date: addDays(-10), type: "entrada", detail: "Factura Suministros Técnicos Norte", requesterName: "Proveedor", status: "importado" }
];

const defaultKeys = [
  ["202", "Artes 1"], ["203", "Artes 2"], ["204", "Construcciones", "prestada", "Luis Vera", "2026-03-18"],
  ["301", "Electricidad 1"], ["302", "Electricidad 2"], ["303", "Electronica 1"], ["304", "Electronica 2"],
  ["305", "Electronica 3", "prestada", "Luis Vera", "2026-03-18"], ["306", "Electricidad 3"], ["307", "Electricidad 4"],
  ["308", "Electricidad 5"], ["309", "Pañol 3er piso"], ["401", "Telecom 1"], ["402", "Telecom 2"],
  ["403", "Telecom 3"], ["404", "Electronica 4"], ["405", "Telecom 4"], ["406", "Electronica 5"],
  ["407", "Electronica 6"], ["408", "Proyecto 408"], ["410", "Pañol 4to piso"]
].map(([number, name, status = "disponible", responsible = "", loanDate = "", observation = ""]) => ({
  id: `key-${number}`,
  number,
  name,
  status,
  responsible,
  loanDate,
  observation
}));

const defaultWorkshopRooms = [
  { id: "workshop-room-1", name: "Sala 1", active: true },
  { id: "workshop-room-2", name: "Sala 2", active: true }
];

const defaultWorkshopSlots = [
  "08:00 - 08:45",
  "08:45 - 09:30",
  "09:45 - 10:30",
  "10:35 - 11:20",
  "11:20 - 12:05",
  "12:05 - 12:50",
  "13:00 - 14:00",
  "14:00 - 15:00",
  "15:00 - 16:00",
  "16:00 - 17:00"
];
const defaultWorkshopTeacherEmails = [
  "fjara@salesianoconcepcion.cl",
  "pherrera@salesianoconcepcion.cl",
  "fiturra@salesianoconcepcion.cl",
  "coordtp@salesianoconcepcion.cl"
];

function createEmptyState() {
  return {
    settings: { criticalThreshold: 5, theme: "dark", operatorName: "Encargado de pañol", operatorRole: "pañolero" },
    appUsers: [defaultAdminUser],
    students: [],
    teachers: [],
    materials: [],
    tools: [],
    keys: defaultKeys,
    workshopRooms: defaultWorkshopRooms,
    workshopReservations: [],
    loans: [],
    requests: [],
    portalUsers: [],
    messages: [],
    invoices: [],
    movements: [],
    auditLog: [],
    backups: []
  };
}

function removeDemoData(state) {
  const demoStudentRuts = new Set(seed.students.map((item) => item.rut));
  const demoTeacherRuts = new Set(seed.teachers.map((item) => item.rut));
  const demoMaterialCodes = new Set(seed.materials.map((item) => item.code));
  const demoToolCodes = new Set(seed.tools.map((item) => item.code));
  const demoInvoiceProviders = new Set(seed.invoices.map((item) => item.provider));
  const demoMovementDetails = new Set(seed.movements.map((item) => item.detail));
  const demoRequesterNames = new Set([...seed.students, ...seed.teachers].map((item) => item.name));

  return {
    ...createEmptyState(),
    ...state,
    settings: { ...createEmptyState().settings, ...(state.settings || {}) },
    appUsers: getAppUsers(state),
    students: (state.students || []).filter((item) => !demoStudentRuts.has(item.rut)),
    teachers: (state.teachers || []).filter((item) => !demoTeacherRuts.has(item.rut)),
    materials: (state.materials || []).filter((item) => !demoMaterialCodes.has(item.code)),
    tools: (state.tools || []).filter((item) => !demoToolCodes.has(item.code)),
    keys: state.keys || defaultKeys,
    workshopRooms: state.workshopRooms || defaultWorkshopRooms,
    workshopReservations: state.workshopReservations || [],
    loans: (state.loans || []).filter((item) => !demoRequesterNames.has(item.requesterName)),
    requests: state.requests || [],
    portalUsers: state.portalUsers || [],
    messages: state.messages || [],
    invoices: (state.invoices || []).filter((item) => !demoInvoiceProviders.has(item.provider)),
    movements: (state.movements || []).filter((item) => !demoMovementDetails.has(item.detail) && !demoRequesterNames.has(item.requesterName)),
    auditLog: state.auditLog || [],
    backups: state.backups || []
  };
}

const AppContext = createContext(null);
const CLOUD_STATE_ID = "panol-central-colegio-salesiano";

function loadInitialState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? stripHeavyStudentPhotos(removeDemoData(JSON.parse(stored))) : createEmptyState();
  } catch {
    return createEmptyState();
  }
}

const cloudMergeCollections = ["students", "teachers", "materials", "tools", "keys", "workshopRooms", "workshopReservations", "loans", "requests", "invoices", "movements", "messages", "portalUsers", "appUsers", "auditLog", "backups"];

function mergeRowsById(remoteRows = [], localRows = []) {
  const merged = new Map();
  remoteRows.forEach((row) => merged.set(row.id || JSON.stringify(row), row));
  localRows.forEach((row) => merged.set(row.id || JSON.stringify(row), row));
  return [...merged.values()];
}

function mergeCloudState(localState, remoteState) {
  const local = stripHeavyStudentPhotos(removeDemoData(localState || createEmptyState()));
  const remote = stripHeavyStudentPhotos(removeDemoData(remoteState || createEmptyState()));
  const merged = { ...remote, ...local, settings: { ...(remote.settings || {}), ...(local.settings || {}) } };
  cloudMergeCollections.forEach((collection) => {
    merged[collection] = mergeRowsById(remote[collection] || [], local[collection] || []);
  });
  merged.auditLog = (merged.auditLog || []).slice(0, 500);
  merged.backups = (merged.backups || []).slice(0, 50);
  return merged;
}

function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE_STATE":
      return stripHeavyStudentPhotos(removeDemoData(action.state || createEmptyState()));
    case "ADD_AUDIT":
      return { ...state, auditLog: [action.entry, ...(state.auditLog || [])].slice(0, 500) };
    case "REGISTER_BACKUP":
      return { ...state, backups: [action.backup, ...(state.backups || [])].slice(0, 50) };
    case "SET_SETTING":
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };
    case "UPSERT_ENTITY": {
      const list = state[action.collection];
      const row = action.row.id ? action.row : { ...action.row, id: uid(action.prefix) };
      return { ...state, [action.collection]: list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [row, ...list] };
    }
    case "DELETE_ENTITY":
      return { ...state, [action.collection]: state[action.collection].filter((x) => x.id !== action.id) };
    case "UPSERT_KEY": {
      const row = action.row.id ? action.row : { ...action.row, id: uid("key"), status: action.row.status || "disponible" };
      const keys = state.keys || [];
      return { ...state, keys: keys.some((item) => item.id === row.id) ? keys.map((item) => item.id === row.id ? row : item) : [row, ...keys] };
    }
    case "UPSERT_WORKSHOP_ROOM": {
      const row = action.row.id ? action.row : { ...action.row, id: uid("wsroom"), active: true };
      const rooms = state.workshopRooms || defaultWorkshopRooms;
      return { ...state, workshopRooms: rooms.some((item) => item.id === row.id) ? rooms.map((item) => item.id === row.id ? row : item) : [row, ...rooms] };
    }
    case "CREATE_WORKSHOP_RESERVATION": {
      const reservation = {
        ...action.reservation,
        id: uid("wsres"),
        folio: nextFolio(state.workshopReservations || [], "TAL", action.reservation.date || today()),
        createdAt: today(),
        status: "activa"
      };
      return {
        ...state,
        workshopReservations: [reservation, ...(state.workshopReservations || [])],
        movements: [{
          id: uid("mov"),
          date: today(),
          type: "reserva",
          detail: `${reservation.folio} · ${reservation.roomName}`,
          requesterName: reservation.teacherName,
          status: "activa"
        }, ...(state.movements || [])]
      };
    }
    case "CANCEL_WORKSHOP_RESERVATION":
      return {
        ...state,
        workshopReservations: (state.workshopReservations || []).map((reservation) => reservation.id === action.id ? { ...reservation, status: "cancelada", cancelReason: action.reason || "", cancelledAt: today() } : reservation)
      };
    case "CHECKOUT_KEY": {
      const key = (state.keys || []).find((item) => item.id === action.id);
      return {
        ...state,
        keys: (state.keys || []).map((item) => item.id === action.id ? { ...item, status: "prestada", responsible: action.responsible, loanDate: today(), observation: action.observation || "" } : item),
        movements: [{ id: uid("mov"), keyId: action.id, date: today(), type: "salida", detail: `Llave ${key?.number || ""} ${key?.name || ""}`, requesterName: action.responsible, status: "prestada", operatorName: state.settings?.operatorName }, ...(state.movements || [])]
      };
    }
    case "RETURN_KEY": {
      const key = (state.keys || []).find((item) => item.id === action.id);
      return {
        ...state,
        keys: (state.keys || []).map((item) => item.id === action.id ? { ...item, status: "disponible", responsible: "", loanDate: "", observation: action.observation || "" } : item),
        movements: [{ id: uid("mov"), keyId: action.id, date: today(), type: "entrada", detail: `Devolucion llave ${key?.number || ""} ${key?.name || ""}`, requesterName: key?.responsible || "Responsable", status: "disponible", operatorName: state.settings?.operatorName }, ...(state.movements || [])]
      };
    }
    case "DELETE_KEY":
      return { ...state, keys: (state.keys || []).filter((item) => item.id !== action.id) };
    case "UPSERT_APP_USER": {
      const row = action.row.id ? action.row : { ...action.row, id: uid("appusr"), createdAt: today(), active: true };
      const users = getAppUsers(state);
      return { ...state, appUsers: users.some((user) => user.id === row.id) ? users.map((user) => user.id === row.id ? row : user) : [row, ...users] };
    }
    case "DELETE_APP_USER":
      return { ...state, appUsers: (state.appUsers || []).filter((user) => user.id !== action.id && user.username !== "panol") };
    case "UPSERT_PORTAL_USER": {
      const row = action.row.id ? action.row : { ...action.row, id: uid("usr"), createdAt: today(), active: true };
      return { ...state, portalUsers: (state.portalUsers || []).some((user) => user.id === row.id) ? state.portalUsers.map((user) => user.id === row.id ? row : user) : [row, ...(state.portalUsers || [])] };
    }
    case "DELETE_PORTAL_USER":
      return { ...state, portalUsers: (state.portalUsers || []).filter((user) => user.id !== action.id) };
    case "CHANGE_PORTAL_PASSWORD":
      return { ...state, portalUsers: (state.portalUsers || []).map((user) => user.id === action.id ? { ...user, password: action.password, mustChangePassword: false } : user) };
    case "BULK_UPSERT": {
      const current = state[action.collection];
      const normalized = action.rows.map((row) => ({ ...row, id: row.id || uid(action.prefix) }));
      const merged = [...current];
      normalized.forEach((row) => {
        const ix = merged.findIndex((item) => (row.code && item.code === row.code) || (row.rut && item.rut === row.rut) || (row.email && item.email === row.email) || (!row.rut && row.name && item.name === row.name) || item.id === row.id);
        if (ix >= 0) merged[ix] = { ...merged[ix], ...row };
        else merged.unshift(row);
      });
      return { ...state, [action.collection]: merged };
    }
    case "IMPORT_STUDENT_PHOTOS": {
      const photosByRut = new Map((action.photos || []).map((photo) => [normalizeRut(photo.rut), photo]));
      return {
        ...state,
        students: (state.students || []).map((student) => {
          const photo = photosByRut.get(normalizeRut(student.rut));
          if (!photo) return student;
          return {
            ...student,
            photoKey: photo.photoKey || studentPhotoKey(photo.rut),
            photoFileName: photo.fileName,
            photoCourse: photo.course || student.course || "",
            photoUpdatedAt: today()
          };
        })
      };
    }
    case "CREATE_REQUEST": {
      const request = { ...action.request, id: uid("sol"), folio: action.request.folio || nextFolio(state.requests, "SOL"), createdAt: today(), status: "pendiente" };
      return {
        ...state,
        requests: [request, ...(state.requests || [])],
        movements: [{ id: uid("mov"), date: today(), type: "solicitud", detail: `${request.folio} · Solicitud docente ${request.items.length} item(s)`, requesterName: request.requesterName, status: "pendiente" }, ...state.movements]
      };
    }
    case "UPDATE_REQUEST_STATUS":
      return { ...state, requests: (state.requests || []).map((request) => request.id === action.id ? { ...request, status: action.status, reviewedAt: today(), reviewNotes: action.notes || "" } : request) };
    case "DELETE_REQUEST":
      return { ...state, requests: (state.requests || []).filter((request) => request.id !== action.id), messages: (state.messages || []).filter((msg) => msg.requestId !== action.id) };
    case "UPDATE_REQUEST_ITEM_PREP":
      return {
        ...state,
        requests: (state.requests || []).map((request) => request.id === action.requestId ? {
          ...request,
          status: request.status === "pendiente" ? "en preparación" : request.status,
          preparationUpdatedAt: today(),
          items: request.items.map((item, index) => index === action.index ? { ...item, prepStatus: action.status, prepNotes: action.notes ?? item.prepNotes ?? "" } : item)
        } : request)
      };
    case "SEND_MESSAGE":
      return { ...state, messages: [{ ...action.message, id: uid("msg"), date: today(), time: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) }, ...(state.messages || [])] };
    case "DELETE_MESSAGE_THREAD":
      return { ...state, messages: (state.messages || []).filter((msg) => msg.teacherId !== action.teacherId) };
    case "MARK_ADMIN_NOTIFICATIONS_READ":
      return { ...state, messages: (state.messages || []).map((msg) => msg.from === "docente" ? { ...msg, adminRead: true } : msg) };
    case "MARK_ADMIN_THREAD_READ":
      return { ...state, messages: (state.messages || []).map((msg) => msg.teacherId === action.teacherId && msg.from === "docente" ? { ...msg, adminRead: true } : msg) };
    case "MARK_TEACHER_NOTIFICATIONS_READ":
      return { ...state, messages: (state.messages || []).map((msg) => msg.teacherId === action.teacherId && msg.from === "pañol" ? { ...msg, teacherRead: true } : msg), requests: (state.requests || []).map((request) => request.requesterId === action.teacherId ? { ...request, teacherNotified: true } : request) };
    case "MARK_TEACHER_THREAD_READ":
      return { ...state, messages: (state.messages || []).map((msg) => msg.teacherId === action.teacherId && msg.from === "pañol" ? { ...msg, teacherRead: true } : msg) };
    case "MARK_TEACHER_REQUEST_NOTIFIED":
      return { ...state, requests: (state.requests || []).map((request) => request.id === action.id ? { ...request, teacherNotified: true } : request) };
    case "APPROVE_REQUEST": {
      const request = (state.requests || []).find((item) => item.id === action.id);
      if (!request) return state;
      const loanFolio = nextFolio(state.loans, "PRE");
      const loan = { ...request, folio: loanFolio, requestFolio: displayFolio(request, "SOL"), expectedReturn: request.expectedDate, notes: request.notes, operatorName: action.operatorName };
      const materials = state.materials.map((m) => {
        const item = loan.items.find((i) => i.type === "material" && i.id === m.id);
        return item ? { ...m, stock: Math.max(0, Number(m.stock) - Number(item.qty)) } : m;
      });
      const tools = state.tools.map((t) => (loan.items.some((i) => i.type === "tool" && i.id === t.id) ? { ...t, status: "en préstamo" } : t));
      const allNonReturnable = loan.items.every((item) => item.nonReturnable);
      const loanStatus = allNonReturnable ? "entregado" : "activo";
      const persistedLoan = { ...loan, id: uid("pre"), sourceRequestId: request.id, createdAt: today(), status: loanStatus };
      return {
        ...state,
        materials,
        tools,
        requests: (state.requests || []).map((item) => item.id === action.id ? { ...item, status: "entregada", reviewedAt: today(), reviewNotes: action.notes || `Solicitud entregada y convertida en prestamo ${loanFolio}` } : item),
        loans: [persistedLoan, ...state.loans],
        movements: [{ id: uid("mov"), loanId: persistedLoan.id, date: today(), type: "salida", detail: `${loanFolio} · Entrega solicitud docente ${loan.items.length} item(s)`, requesterName: loan.requesterName, status: loanStatus, operatorName: action.operatorName }, ...state.movements]
      };
    }
    case "CREATE_LOAN": {
      const loan = { ...action.loan, folio: action.loan.folio || nextFolio(state.loans, "PRE") };
      const materials = state.materials.map((m) => {
        const item = loan.items.find((i) => i.type === "material" && i.id === m.id);
        return item ? { ...m, stock: Math.max(0, Number(m.stock) - Number(item.qty)) } : m;
      });
      const tools = state.tools.map((t) => (loan.items.some((i) => i.type === "tool" && i.id === t.id) ? { ...t, status: "en préstamo" } : t));
      const allNonReturnable = loan.items.every((item) => item.nonReturnable);
      const loanStatus = allNonReturnable ? "entregado" : "activo";
      const persistedLoan = { ...loan, id: loan.id || uid("pre"), createdAt: today(), status: loanStatus };
      const movement = { id: uid("mov"), loanId: persistedLoan.id, date: today(), type: "salida", detail: `${loan.folio} · ${allNonReturnable ? "Entrega" : "Prestamo"} ${loan.items.length} item(s)`, requesterName: loan.requesterName, status: loanStatus, operatorName: loan.operatorName };
      return { ...state, materials, tools, loans: [persistedLoan, ...state.loans], movements: [movement, ...state.movements] };
    }
    case "RETURN_LOAN": {
      const returned = action.items;
      const loans = state.loans.map((loan) => (loan.id === action.loanId ? { ...loan, status: action.partial ? "activo" : "devuelto", partialReturn: action.partial, returnedAt: today(), returnNotes: action.notes, returnOperatorName: action.operatorName } : loan));
      const materials = state.materials.map((m) => {
        const item = returned.find((i) => i.type === "material" && i.id === m.id && !i.nonReturnable);
        return item ? { ...m, stock: Number(m.stock) + Number(item.qty || 0) } : m;
      });
      const tools = state.tools.map((t) => {
        const item = returned.find((i) => i.type === "tool" && i.id === t.id);
        return item ? { ...t, status: item.condition === "reparación" ? "en reparación" : item.condition === "dañado" ? "dañado" : item.condition === "perdido" ? "perdido" : "disponible" } : t;
      });
      const loan = state.loans.find((l) => l.id === action.loanId);
      return {
        ...state,
        loans,
        materials,
        tools,
        movements: [{ id: uid("mov"), loanId: action.loanId, date: today(), type: "entrada", detail: `${displayFolio(loan, "PRE")} · Devolucion ${returned.length} item(s)`, requesterName: loan?.requesterName || "Solicitante", status: action.partial ? "parcial" : "devuelto", operatorName: action.operatorName }, ...state.movements]
      };
    }
    case "IMPORT_INVOICE": {
      let materials = [...state.materials];
      action.items.forEach((item) => {
        const ix = materials.findIndex((m) => m.code?.toLowerCase() === item.code?.toLowerCase() || m.name.toLowerCase() === item.name.toLowerCase());
        if (ix >= 0) {
          materials[ix] = { ...materials[ix], stock: Number(materials[ix].stock) + Number(item.qty) };
        } else {
          const category = item.category || "Sin clasificar";
          const code = item.code || generateEntityCode({ ...state, materials }, "materials", { category });
          materials.unshift({ id: uid("mat"), name: item.name, code, category, stock: Number(item.qty), minStock: 5, unit: "un", location: "Por asignar" });
        }
      });
      const invoice = { id: uid("fac"), date: today(), provider: action.provider, invoiceNumber: action.invoiceNumber || "", itemsCount: action.items.length, documentName: action.documentName };
      const invoiceDetail = action.invoiceNumber ? `Factura ${action.invoiceNumber} - ${action.provider}` : `Factura ${action.provider}`;
      return {
        ...state,
        materials,
        invoices: [invoice, ...state.invoices],
        movements: [{ id: uid("mov"), date: today(), type: "entrada", detail: invoiceDetail, requesterName: "Proveedor", status: "importado" }, ...state.movements]
      };
    }
    case "UPDATE_INVOICE":
      return {
        ...state,
        invoices: state.invoices.map((invoice) => invoice.id === action.id ? { ...invoice, ...action.patch } : invoice)
      };
    case "RESET_DATA":
      return createEmptyState();
    default:
      return state;
  }
}

function auditEntryForAction(action, state) {
  const ignored = new Set(["HYDRATE_STATE", "ADD_AUDIT", "REGISTER_BACKUP", "MARK_ADMIN_NOTIFICATIONS_READ", "MARK_ADMIN_THREAD_READ", "MARK_TEACHER_NOTIFICATIONS_READ", "MARK_TEACHER_THREAD_READ", "MARK_TEACHER_REQUEST_NOTIFIED"]);
  if (!action?.type || ignored.has(action.type)) return null;
  const labels = {
    SET_SETTING: `Ajuste modificado: ${action.key}`,
    UPSERT_ENTITY: `Registro guardado en ${action.collection}`,
    DELETE_ENTITY: `Registro eliminado de ${action.collection}`,
    UPSERT_KEY: `Llave guardada: ${action.row?.number || ""}`,
    CHECKOUT_KEY: `Llave prestada a ${action.responsible || ""}`,
    RETURN_KEY: "Llave devuelta al pañol",
    DELETE_KEY: "Llave eliminada",
    UPSERT_APP_USER: `Perfil de acceso guardado: ${action.row?.username || action.row?.name || ""}`,
    DELETE_APP_USER: "Perfil de acceso eliminado",
    UPSERT_PORTAL_USER: `Acceso docente guardado: ${action.row?.teacherName || ""}`,
    DELETE_PORTAL_USER: "Acceso docente eliminado",
    CHANGE_PORTAL_PASSWORD: "Clave de portal docente cambiada",
    BULK_UPSERT: `Carga masiva en ${action.collection}: ${action.rows?.length || 0} registro(s)`,
    CREATE_REQUEST: `Solicitud creada por ${action.request?.requesterName || "docente"}`,
    UPDATE_REQUEST_STATUS: `Solicitud marcada como ${action.status}`,
    DELETE_REQUEST: "Solicitud docente eliminada",
    UPDATE_REQUEST_ITEM_PREP: "Preparación de solicitud actualizada",
    SEND_MESSAGE: `Mensaje ${action.message?.from || ""} -> ${action.message?.to || ""}`,
    DELETE_MESSAGE_THREAD: "Conversacion eliminada",
    APPROVE_REQUEST: "Solicitud aprobada",
    UPSERT_WORKSHOP_ROOM: `Sala de taller guardada: ${action.row?.name || ""}`,
    CREATE_WORKSHOP_RESERVATION: `Reserva de taller creada: ${action.reservation?.teacherName || ""}`,
    CANCEL_WORKSHOP_RESERVATION: "Reserva de taller cancelada",
    CREATE_LOAN: `Prestamo registrado para ${action.loan?.requesterName || "solicitante"}${action.loan?.folio ? ` (${action.loan.folio})` : ""}`,
    RETURN_LOAN: "Devolucion registrada",
    IMPORT_INVOICE: `Factura importada: ${action.provider || ""}`,
    UPDATE_INVOICE: "Factura actualizada",
    RESET_DATA: "Datos del sistema vaciados"
  };
  return {
    id: uid("aud"),
    date: today(),
    time: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
    actor: state.settings?.operatorName || "Sistema",
    type: action.type,
    detail: labels[action.type] || action.type
  };
}

function AppProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, loadInitialState);
  const [toast, setToast] = useState(null);
  const [cloudReady, setCloudReady] = useState(!isSupabaseConfigured);
  const [cloudStatus, setCloudStatus] = useState(isSupabaseConfigured ? "Esperando sesión segura" : "Modo local");
  const [cloudSession, setCloudSession] = useState(null);
  const cloudRevision = useRef(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setCloudSession(data.session || null);
      if (!data.session) {
        setCloudReady(true);
        setCloudStatus("Inicia sesión para sincronizar con Supabase");
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudSession(session || null);
      if (!session) {
        setCloudReady(true);
        setCloudStatus("Inicia sesión para sincronizar con Supabase");
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (!cloudSession) return;
    let cancelled = false;
    async function loadCloudState() {
      setCloudReady(false);
      setCloudStatus("Conectando a base central");
      const { data, error } = await supabase
        .from("app_state")
        .select("data, revision")
        .eq("id", CLOUD_STATE_ID)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Error cargando Supabase", error);
        setCloudStatus("Sin conexion a base central");
        setCloudReady(true);
        return;
      }
      if (data?.data) {
        cloudRevision.current = Number(data.revision || 0);
        rawDispatch({ type: "HYDRATE_STATE", state: mergeCloudState(state, data.data) });
        setCloudStatus("Base central conectada");
      } else {
        setCloudStatus("Base central inicializada");
      }
      setCloudReady(true);
    }
    loadCloudState();
    return () => {
      cancelled = true;
    };
  }, [cloudSession?.access_token]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripHeavyStudentPhotos(state)));
    } catch (error) {
      console.error("No se pudo guardar estado local", error);
    }
  }, [state]);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !cloudReady || !cloudSession) return;
    const handle = setTimeout(async () => {
      const persistedState = stripHeavyStudentPhotos(state);
      const nextRevision = cloudRevision.current + 1;
      let error = null;
      let savedRevision = nextRevision;
      if (cloudRevision.current === 0) {
        const result = await supabase
          .from("app_state")
          .upsert({ id: CLOUD_STATE_ID, data: persistedState, revision: nextRevision, updated_at: new Date().toISOString() });
        error = result.error;
      } else {
        const result = await supabase
          .from("app_state")
          .update({ data: persistedState, revision: nextRevision, updated_at: new Date().toISOString() })
          .eq("id", CLOUD_STATE_ID)
          .eq("revision", cloudRevision.current)
          .select("revision")
          .maybeSingle();
        error = result.error;
        if (!error && !result.data) {
          setCloudStatus("Uniendo cambios remotos antes de guardar");
          const latest = await supabase
            .from("app_state")
            .select("data, revision")
            .eq("id", CLOUD_STATE_ID)
            .maybeSingle();
          if (latest.error || !latest.data?.data) {
            console.error("Error resolviendo conflicto Supabase", latest.error);
            setCloudStatus("Conflicto de sincronización. Recarga antes de seguir.");
            return;
          }
          const mergedState = mergeCloudState(persistedState, latest.data.data);
          savedRevision = Number(latest.data.revision || 0) + 1;
          const mergedSave = await supabase
            .from("app_state")
            .update({ data: mergedState, revision: savedRevision, updated_at: new Date().toISOString() })
            .eq("id", CLOUD_STATE_ID)
            .eq("revision", latest.data.revision)
            .select("revision")
            .maybeSingle();
          if (mergedSave.error || !mergedSave.data) {
            console.error("Error guardando mezcla Supabase", mergedSave.error);
            setCloudStatus("No se pudo resolver la sincronización. Recarga antes de seguir.");
            return;
          }
          cloudRevision.current = savedRevision;
          rawDispatch({ type: "HYDRATE_STATE", state: mergedState });
          setCloudStatus("Base central sincronizada con cambios mezclados");
          return;
        }
      }
      if (error) {
        console.error("Error guardando Supabase", error);
        setCloudStatus("Error al guardar en base central");
      } else {
        cloudRevision.current = savedRevision;
        setCloudStatus("Base central sincronizada");
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [state, cloudReady, cloudSession?.access_token]);
  const dispatch = (action) => {
    rawDispatch(action);
    const entry = auditEntryForAction(action, state);
    if (entry) rawDispatch({ type: "ADD_AUDIT", entry });
  };
  const notify = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2600);
  };
  const value = useMemo(() => ({ state, dispatch, notify, cloudStatus, cloudReady }), [state, cloudStatus, cloudReady]);
  return (
    <AppContext.Provider value={value}>
      {children}
      {toast && <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`}><Check size={16} />{toast.message}</div>}
    </AppContext.Provider>
  );
}

const useApp = () => useContext(AppContext);

function clearAuthStorage() {
  sessionStorage.removeItem(APP_SESSION_KEY);
  sessionStorage.removeItem(PORTAL_SESSION_KEY);
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith("sb-") && key.includes("auth-token")) localStorage.removeItem(key);
  });
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-700/60 text-slate-200 border-slate-600",
    green: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/12 text-amber-300 border-amber-500/30",
    red: "bg-red-500/12 text-red-300 border-red-500/30",
    blue: "bg-sky-500/12 text-sky-300 border-sky-500/30"
  };
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function NotificationsBell({ notifications, onMarkRead }) {
  const [open, setOpen] = useState(false);
  const unread = notifications.length;

  const popover = open ? createPortal(
    <div
      className="fixed z-[2147483647] w-[360px] max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
      style={{
        top: "82px",
        right: "28px"
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <p className="font-bold text-slate-950">Alertas</p>

        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkRead}
              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Marcar leídas
            </button>
          )}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="grid max-h-[360px] gap-2 overflow-auto">
        {notifications.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">
            Sin alertas nuevas
          </p>
        )}

        {notifications.map((item, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              item.onOpen?.();
              setOpen(false);
            }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-yellow-400 hover:bg-yellow-50"
          >
            <p className="font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm text-slate-600">{item.body}</p>
            <p className="mt-2 text-xs font-semibold text-yellow-700">
              {item.actionLabel || "Abrir"}
            </p>
          </button>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <Button
        variant="secondary"
        onClick={() => setOpen(!open)}
        className="relative px-3"
      >
        <Bell size={16} />
        Alertas

        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs text-white">
            {unread}
          </span>
        )}
      </Button>

      {popover}
    </div>
  );
}

function GlobalSearch({ allowedSections = [], onSelect }) {
  const { state, dispatch, notify } = useApp();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const allowed = useMemo(() => new Set(allowedSections), [allowedSections]);
  const canSee = (section) => allowed.has(section);
  const results = useMemo(() => {
    const term = normalizeHeader(query);
    if (term.length < 2) return [];
    const matches = (value) => normalizeHeader(String(value || "")).includes(term);
    const rows = [];
    if (canSee("people")) {
      (state.students || []).forEach((student) => {
        const text = `${student.name} ${student.rut} ${student.course} ${student.email} ${student.phone}`;
        if (matches(text)) rows.push({ id: `student-${student.id}`, section: "people", type: "Alumno", title: student.name, meta: `${student.course || "Sin curso"} · ${student.email || "sin email"}` });
      });
      (state.teachers || []).forEach((teacher) => {
        const text = `${teacher.name} ${teacher.department} ${teacher.email}`;
        if (matches(text)) rows.push({ id: `teacher-${teacher.id}`, section: "people", type: "Profesor", title: teacher.name, meta: `${teacher.department || "Sin departamento"} · ${teacher.email || "sin email"}` });
      });
    }
    if (canSee("inventory")) {
      (state.materials || []).forEach((item) => {
        const text = `${item.name} ${item.code} ${item.category} ${item.location}`;
        if (matches(text)) rows.push({ id: `material-${item.id}`, section: "inventory", type: "Material", title: item.name, meta: `${item.code || "sin codigo"} · stock ${item.stock ?? 0} ${item.unit || ""}` });
      });
      (state.tools || []).forEach((item) => {
        const text = `${item.name} ${item.code} ${item.status} ${item.description}`;
        if (matches(text)) rows.push({ id: `tool-${item.id}`, section: "inventory", type: "Herramienta", title: item.name, meta: `${item.code || "sin codigo"} · ${item.status || "sin estado"}` });
      });
    }
    if (canSee("keys")) {
      (state.keys || []).forEach((key) => {
        const text = `${key.number} ${key.name} ${key.status} ${key.responsible} ${key.observation}`;
        if (matches(text)) rows.push({ id: `key-${key.id}`, section: "keys", type: "Llave", title: `${key.number} · ${key.name}`, meta: key.status === "prestada" ? `Prestada a ${key.responsible || "sin responsable"}` : "Disponible en pañol" });
      });
    }
    if (canSee("loans")) {
      (state.loans || []).forEach((loan) => {
        const folio = displayFolio(loan, "PRE");
        const items = (loan.items || []).map((item) => `${item.name} ${item.code}`).join(" ");
        const text = `${folio} ${loan.requesterName} ${loan.status} ${loan.notes} ${items}`;
        if (matches(text)) rows.push({ id: `loan-${loan.id}`, section: "loans", type: "Prestamo", title: `${folio} · ${loan.requesterName}`, meta: `${loan.status} · vence ${loan.expectedReturn ? formatDate(loan.expectedReturn) : "sin fecha"}` });
      });
    }
    if (canSee("requests")) {
      (state.requests || []).forEach((request) => {
        const folio = displayFolio(request, "SOL");
        const items = (request.items || []).map((item) => `${item.name} ${item.code}`).join(" ");
        const text = `${folio} ${request.requesterName} ${request.status} ${request.notes} ${items}`;
        if (matches(text)) rows.push({ id: `request-${request.id}`, section: "requests", type: "Solicitud", title: `${folio} · ${request.requesterName}`, meta: `${request.status} · ${(request.items || []).length} item(s)` });
      });
    }
    if (canSee("messages")) {
      (state.messages || []).forEach((msg) => {
        const text = `${msg.teacherName} ${msg.body} ${msg.requestTitle}`;
        if (matches(text)) rows.push({ id: `message-${msg.id}`, section: "messages", focusedTeacherId: msg.teacherId, type: "Mensaje", title: msg.teacherName, meta: msg.body });
      });
    }
    if (canSee("invoices")) {
      (state.invoices || []).forEach((invoice) => {
        const text = `${invoice.provider} ${invoice.invoiceNumber || ""} ${invoice.documentName} ${invoice.date}`;
        const invoiceLabel = invoice.invoiceNumber ? `Factura ${invoice.invoiceNumber}` : "Factura sin numero";
        if (matches(text)) rows.push({ id: `invoice-${invoice.id}`, section: "invoices", type: "Factura", title: `${invoiceLabel} · ${invoice.provider || "Sin proveedor"}`, meta: `${invoice.documentName || "sin documento"} · ${invoice.itemsCount || 0} item(s)` });
      });
    }
    return rows.slice(0, 10);
  }, [allowed, query, state]);

  const selectResult = (result) => {
    onSelect(result);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="global-search relative w-full md:max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
      <input
        className={`${inputClass} h-10 pl-10`}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) selectResult(results[0]);
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Buscar en todo el sistema"
      />
      {open && query.length >= 2 && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-96 overflow-auto rounded-lg border border-steel-700 bg-steel-900 p-2 shadow-2xl">
          {results.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">Sin resultados</p>}
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectResult(result)}
              className="w-full rounded-md px-3 py-2 text-left transition hover:bg-steel-800"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-semibold text-white">{result.title}</p>
                <Badge tone="blue">{result.type}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">{result.meta}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "pc-button-primary bg-safety-500 text-steel-950 hover:bg-safety-600",
    secondary: "pc-button-secondary bg-steel-800 text-slate-100 hover:bg-steel-700 border border-steel-700",
    ghost: "pc-button-ghost text-slate-300 hover:bg-steel-800",
    danger: "pc-button-danger bg-red-600 text-white hover:bg-red-700"
  };

  return (
    <button
      {...props}
      type={props.type || "button"}
      className={`pc-button inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return <label className="grid gap-1 text-sm text-slate-300"><span>{label}</span>{children}</label>;
}

const inputClass = "pc-input w-full rounded-md border border-steel-700 bg-steel-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-safety-500";

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="pc-modal-backdrop fixed inset-0 z-40 grid place-items-center bg-black/60 p-2 sm:p-4" onMouseDown={onClose}>
      <div className={`pc-modal-card max-h-[92vh] w-full ${wide ? "max-w-6xl" : "max-w-2xl"} overflow-auto rounded-lg border border-steel-700 bg-steel-900 shadow-2xl`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-steel-700 px-3 py-3 sm:px-5 sm:py-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <Button variant="ghost" onClick={onClose} className="px-2"><X size={18} /></Button>
        </div>
        <div className="p-3 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function StudentPhotoAvatar({ person, size = "sm" }) {
  const [photoUrl, setPhotoUrl] = useState(person?.photoUrl || "");
  useEffect(() => {
    let mounted = true;
    if (person?.photoUrl) {
      setPhotoUrl(person.photoUrl);
      return () => {
        mounted = false;
      };
    }
    if (!person?.photoKey) {
      setPhotoUrl("");
      return () => {
        mounted = false;
      };
    }
    getStudentPhoto(person.photoKey)
      .then((url) => {
        if (mounted) setPhotoUrl(url);
      })
      .catch(() => {
        if (mounted) setPhotoUrl("");
      });
    return () => {
      mounted = false;
    };
  }, [person?.photoKey, person?.photoUrl]);
  const initials = String(person?.name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const sizes = {
    xs: "h-9 w-9 text-xs",
    sm: "h-12 w-12 text-sm",
    lg: "h-24 w-24 text-xl"
  };
  const className = `${sizes[size] || sizes.sm} shrink-0 rounded-md border border-steel-700 object-cover`;
  if (photoUrl) {
    return <img src={photoUrl} alt={`Foto de ${person.name}`} className={className} />;
  }
  return (
    <div className={`${className} grid place-items-center bg-steel-800 font-bold text-slate-300`}>
      {initials}
    </div>
  );
}

function ConfirmModal({ title, body, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-slate-300">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button variant="danger" onClick={onConfirm}><Trash2 size={16} />Eliminar</Button>
      </div>
    </Modal>
  );
}

function Layout({ section, setSection, currentUser, onLogout }) {
  const { state, dispatch } = useApp();
  const isLight = state.settings.theme === "light";
  const [focusedTeacherId, setFocusedTeacherId] = useState("");
  const [keyPanelOpen, setKeyPanelOpen] = useState(false);
  const [loanInitialView, setLoanInitialView] = useState("loan");
  const [returnFocusLoanId, setReturnFocusLoanId] = useState("");
  const nav = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["alerts", "Centro de alertas", Bell],
    ["people", "Personas", UsersRound],
    ["inventory", "Inventario", Boxes],
    ["keys", "Control de llaves", KeyRound],
    ["workshop", "Reservas taller", CalendarDays],
    ["loans", "Entrega y recepción", ClipboardList],
    ["requests", "Solicitudes docentes", Inbox],
    ["messages", "Mensajes", MessageSquare],
    ["assistant", "Asistente IA", Wand2],
    ["audit", "Bitácora", History],
    ["invoices", "Facturas", ReceiptText],
    ["database", "Bases de datos", Database],
    ["reports", "Reportes", BarChart3],
    ["settings", "Ajustes", Settings]
  ];
  const titles = {
    dashboard: "Dashboard principal",
    alerts: "Centro de alertas",
    people: "Alumnos y profesores",
    inventory: "Materiales y herramientas",
    keys: "Control de llaves",
    workshop: "Reservas taller mecánico",
    loans: "Entrega y recepción",
    requests: "Solicitudes docentes",
    messages: "Mensajes",
    assistant: "Asistente IA",
    audit: "Bitácora",
    invoices: "Carga de facturas",
    database: "Carga de bases de datos",
    reports: "Reportes",
    settings: "Configuración"
  };
  const allowedNav = nav.filter(([id]) => currentUser?.permissions?.includes(id));
  const pendingRequestsCount = (state.requests || []).filter((request) => request.status === "pendiente").length;
  const unreadMessagesCount = (state.messages || []).filter((msg) => msg.from === "docente" && !msg.adminRead).length;
  const preparingRequestsCount = (state.requests || []).filter((request) => request.status === "en preparación").length;
  const criticalAdminAlerts = buildAdminAlerts(state).filter((alert) => ["crítica", "media"].includes(alert.priority) && alert.rows?.length).slice(0, 5);
  const adminNotifications = [
    ...criticalAdminAlerts.map((alert) => ({
      title: alert.title,
      body: alert.body,
      actionLabel: alert.actionLabel || "Abrir alerta",
      onOpen: () => setSection(alert.section || "alerts")
    })),
    ...(state.requests || []).filter((request) => request.status === "pendiente").map((request) => ({
      title: "Solicitud docente pendiente",
      body: `${request.requesterName}: ${request.items.length} item(s)`,
      actionLabel: "Abrir solicitud",
      onOpen: () => setSection("requests")
    })),
    ...(state.messages || []).filter((msg) => msg.from === "docente" && !msg.adminRead).map((msg) => ({
      title: `Mensaje de ${msg.teacherName}`,
      body: msg.body,
      actionLabel: "Responder conversación",
      onOpen: () => {
        setFocusedTeacherId(msg.teacherId);
        setSection("messages");
        dispatch({ type: "MARK_ADMIN_THREAD_READ", teacherId: msg.teacherId });
      }
    }))
  ];
  useEffect(() => {
    if (!currentUser?.permissions?.includes(section)) setSection(currentUser?.permissions?.[0] || "dashboard");
  }, [currentUser, section, setSection]);
  return (
    <div className={`pc-shell min-h-screen bg-steel-950 text-slate-100 ${isLight ? "theme-light" : "theme-dark"}`}>
      <aside className="pc-sidebar fixed inset-y-0 left-0 hidden w-72 border-r border-steel-800 bg-steel-900 lg:block">
        <div className="flex h-20 items-center gap-3 border-b border-steel-800 px-6">
          <div className="grid h-12 w-12 place-items-center rounded-md border border-safety-500/50 bg-white p-1 shadow-sm"><img src="/logo-salesiano.png" alt="Colegio Salesiano" className="h-full w-full object-contain" /></div>
          <div>
            <p className="text-lg font-bold">PAÑOL CENTRAL</p>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Gestión institucional</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-safety-500">Colegio Salesiano</p>
          </div>
        </div>
        <nav className="space-y-1 p-4">
          {allowedNav.map(([id, label, Icon]) => (
            <button key={id} onClick={() => id === "keys" ? setKeyPanelOpen(true) : setSection(id)} className={`flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-sm font-semibold transition ${section === id || (id === "keys" && keyPanelOpen) ? "bg-safety-500 text-steel-950" : "text-slate-300 hover:bg-steel-800"}`}>
              <Icon size={19} />{label}
            </button>
          ))}
        </nav>
        <div className="pc-version-card absolute bottom-4 left-4 right-4 rounded-md border border-steel-800 bg-steel-950/60 px-4 py-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">PAÑOL CENTRAL {APP_VERSION}</p>
          <p>GitHub + Cloudflare activo</p>
        </div>
      </aside>
      <div className="pc-content lg:pl-72">
        <header className="pc-topbar sticky top-0 z-30 border-b border-steel-800 bg-steel-950/92 px-3 py-3 backdrop-blur md:px-8 md:py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-slate-400">Pañol / {titles[section]}</p>
              <h1 className="truncate text-xl font-bold text-white md:text-2xl">{titles[section]}</h1>
              <p className="text-xs text-slate-500 lg:hidden">PAÑOL CENTRAL {APP_VERSION}</p>
            </div>
            <GlobalSearch
              allowedSections={currentUser?.permissions || []}
              onSelect={(result) => {
                if (result.focusedTeacherId) setFocusedTeacherId(result.focusedTeacherId);
                if (result.section === "keys") {
                  setKeyPanelOpen(true);
                  return;
                }
                setSection(result.section);
              }}
            />
            <div className="mobile-actions flex flex-wrap items-center gap-2">
              <span className="hidden text-sm text-slate-400 md:inline">{currentUser?.name}</span>
              <NotificationsBell notifications={adminNotifications} onMarkRead={() => dispatch({ type: "MARK_ADMIN_NOTIFICATIONS_READ" })} />
              <Button variant="secondary" onClick={() => dispatch({ type: "SET_SETTING", key: "theme", value: isLight ? "dark" : "light" })} title={isLight ? "Tema oscuro" : "Tema claro"} className="shrink-0 px-3">
                {isLight ? <Moon size={16} /> : <Sun size={16} />}
                {isLight ? "Oscuro" : "Claro"}
              </Button>
              <Button variant="secondary" onClick={onLogout} className="shrink-0 px-3"><LogOut size={16} />Salir</Button>
            </div>
            <div className="pc-mobile-nav mobile-nav -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
              {allowedNav.map(([id, label, Icon]) => (
                <Button key={id} variant={section === id || (id === "keys" && keyPanelOpen) ? "primary" : "secondary"} onClick={() => id === "keys" ? setKeyPanelOpen(true) : setSection(id)} className="shrink-0 whitespace-nowrap">
                  <Icon size={16} />{label}
                </Button>
              ))}
            </div>
          </div>
        </header>
        <main className="pc-main app-main p-3 md:p-8">
          {state.settings.showAdminAlertStrip !== false && (pendingRequestsCount > 0 || unreadMessagesCount > 0 || preparingRequestsCount > 0) && (
            <div className="admin-alert-strip mb-4 grid gap-2 rounded-lg border border-safety-500/40 bg-safety-500/10 p-3 text-sm text-slate-100 md:grid-cols-[1fr_auto] md:items-center">
              <div className="flex flex-wrap gap-2">
                {pendingRequestsCount > 0 && <Badge tone="amber">{pendingRequestsCount} solicitud(es) pendiente(s)</Badge>}
                {preparingRequestsCount > 0 && <Badge tone="blue">{preparingRequestsCount} en preparación</Badge>}
                {unreadMessagesCount > 0 && <Badge tone="green">{unreadMessagesCount} mensaje(s) nuevo(s)</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingRequestsCount > 0 && <Button onClick={() => setSection("requests")}><Inbox size={16} />Ver solicitudes</Button>}
                {unreadMessagesCount > 0 && <Button variant="secondary" onClick={() => setSection("messages")}><MessageSquare size={16} />Abrir chat</Button>}
              </div>
            </div>
          )}
          {section === "dashboard" && currentUser?.permissions?.includes("dashboard") && (
            <Dashboard
              openKeys={() => setKeyPanelOpen(true)}
              openLoans={(view = "return", loanId = "") => {
                setLoanInitialView(view);
                setReturnFocusLoanId(loanId);
                setSection("loans");
              }}
            />
          )}
          {section === "alerts" && <AdminAlertsCenter setSection={setSection} />}
          {section === "people" && <People />}
          {section === "inventory" && <Inventory />}
          {section === "workshop" && <WorkshopReservations currentUser={currentUser} />}
          {section === "loans" && <Loans initialView={loanInitialView} returnFocusLoanId={returnFocusLoanId} />}
          {section === "requests" && <TeacherRequestsInbox />}
          {section === "messages" && <MessagesCenter focusedTeacherId={focusedTeacherId} />}
          {section === "assistant" && <AdminAssistant />}
          {section === "audit" && <BackupAuditPanel />}
          {section === "invoices" && <Invoices />}
          {section === "database" && <DatabaseImport />}
          {section === "reports" && <Reports />}
          {section === "settings" && <SettingsPage />}
        </main>
        {currentUser?.permissions?.includes("messages") && (
          <button type="button" onClick={() => setSection("messages")} className="chat-fab fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-safety-500 text-steel-950 shadow-2xl transition hover:bg-safety-600" title="Abrir chat">
            <MessageSquare size={24} />
            {unreadMessagesCount > 0 && <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{unreadMessagesCount}</span>}
          </button>
        )}
        {keyPanelOpen && <KeyControlModal onClose={() => setKeyPanelOpen(false)} />}
      </div>
    </div>
  );
}

function KeyControlModal({ onClose }) {
  const { state, dispatch, notify } = useApp();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [responsible, setResponsible] = useState("");
  const [observation, setObservation] = useState("");
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState({ number: "", name: "", observation: "" });
  const keys = [...(state.keys || defaultKeys)].sort((a, b) => Number(a.number) - Number(b.number));
  const selected = keys.find((key) => key.id === selectedId);
  const filtered = keys.filter((key) => {
    const term = normalizeHeader(query);
    if (!term) return true;
    return normalizeHeader(`${key.number} ${key.name} ${key.status} ${key.responsible} ${key.observation}`).includes(term);
  });
  const borrowed = keys.filter((key) => key.status === "prestada");
  const available = keys.length - borrowed.length;
  const peopleOptions = [...(state.teachers || []), ...(state.students || [])].map((person) => person.name).filter(Boolean);

  const selectKey = (key) => {
    setSelectedId(key.id);
    setResponsible(key.responsible || "");
    setObservation(key.observation || "");
  };
  const checkout = () => {
    if (!selected || !responsible.trim()) {
      notify("Indica quien retira la llave", "error");
      return;
    }
    dispatch({ type: "CHECKOUT_KEY", id: selected.id, responsible: responsible.trim(), observation });
    notify(`Llave ${selected.number} prestada a ${responsible.trim()}`);
    selectKey({ ...selected, status: "prestada", responsible: responsible.trim(), observation });
  };
  const returnKey = () => {
    if (!selected) return;
    dispatch({ type: "RETURN_KEY", id: selected.id, observation });
    notify(`Llave ${selected.number} devuelta al pañol`);
    setResponsible("");
    setObservation("");
  };
  const saveNewKey = () => {
    if (!newKey.number.trim() || !newKey.name.trim()) {
      notify("Ingresa numero y nombre de la sala", "error");
      return;
    }
    const exists = keys.some((key) => normalizeHeader(key.number) === normalizeHeader(newKey.number));
    if (exists) {
      notify("Ya existe una llave con ese numero", "error");
      return;
    }
    dispatch({ type: "UPSERT_KEY", row: { ...newKey, number: newKey.number.trim(), name: newKey.name.trim(), status: "disponible" } });
    notify("Llave agregada al tablero");
    setNewKey({ number: "", name: "", observation: "" });
    setAdding(false);
  };

  return (
    <Modal title="Control de llaves" onClose={onClose} wide>
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar sala, numero o responsable" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{available} en pañol</Badge>
            <Badge tone="red">{borrowed.length} prestada(s)</Badge>
          </div>
          <Button variant="secondary" onClick={() => setAdding(!adding)}><Plus size={16} />Agregar sala</Button>
        </div>

        {adding && (
          <div className="grid gap-3 rounded-lg border border-steel-700 bg-steel-850 p-3 md:grid-cols-[140px_1fr_1fr_auto] md:items-end">
            <Field label="Numero"><input className={inputClass} value={newKey.number} onChange={(event) => setNewKey({ ...newKey, number: event.target.value })} placeholder="Ej: 411" /></Field>
            <Field label="Nombre sala"><input className={inputClass} value={newKey.name} onChange={(event) => setNewKey({ ...newKey, name: event.target.value })} placeholder="Ej: Laboratorio" /></Field>
            <Field label="Observacion"><input className={inputClass} value={newKey.observation} onChange={(event) => setNewKey({ ...newKey, observation: event.target.value })} placeholder="Opcional" /></Field>
            <Button onClick={saveNewKey}><Save size={16} />Guardar</Button>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className="grid max-h-[58vh] grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {filtered.map((key) => {
              const isBorrowed = key.status === "prestada";
              const title = isBorrowed
                ? `Prestada a ${key.responsible || "sin responsable"}${key.loanDate ? ` desde ${formatDate(key.loanDate)}` : ""}${key.observation ? ` - ${key.observation}` : ""}`
                : "Disponible en pañol";
              return (
                <button
                  key={key.id}
                  type="button"
                  title={title}
                  onClick={() => selectKey(key)}
                  className={`min-h-28 rounded-lg border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${selectedId === key.id ? "ring-2 ring-safety-500" : ""} ${isBorrowed ? "border-red-500 bg-red-50 text-red-950 dark:bg-red-500/15 dark:text-red-100" : "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-500/15 dark:text-emerald-100"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-2xl font-black">{key.number}</p>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${isBorrowed ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}>{isBorrowed ? "Prestada" : "En pañol"}</span>
                  </div>
                  <p className="mt-2 font-bold leading-tight">{key.name}</p>
                  {isBorrowed && <p className="mt-1 truncate text-xs font-semibold">{key.responsible}</p>}
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-steel-700 bg-steel-850 p-4">
            {!selected ? (
              <div className="grid min-h-64 place-items-center text-center text-sm text-slate-400">
                <div>
                  <KeyRound className="mx-auto mb-2" size={28} />
                  Selecciona una sala del tablero para registrar prestamo o devolucion.
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-3xl font-black text-white">{selected.number}</p>
                      <p className="font-bold text-slate-200">{selected.name}</p>
                    </div>
                    <Badge tone={selected.status === "prestada" ? "red" : "green"}>{selected.status === "prestada" ? "Prestada" : "En pañol"}</Badge>
                  </div>
                  {selected.status === "prestada" && (
                    <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
                      <p className="font-bold">La tiene: {selected.responsible || "Sin responsable"}</p>
                      <p>{selected.loanDate ? `Prestada desde ${formatDate(selected.loanDate)}` : "Sin fecha registrada"}</p>
                    </div>
                  )}
                </div>
                <Field label="Responsable"><input className={inputClass} value={responsible} onChange={(event) => setResponsible(event.target.value)} list="key-responsibles" placeholder="Nombre de profesor o trabajador" /></Field>
                <datalist id="key-responsibles">{peopleOptions.map((name) => <option key={name} value={name} />)}</datalist>
                <Field label="Observacion"><textarea className={`${inputClass} min-h-24`} value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Motivo, reemplazo, comentario" /></Field>
                <div className="flex flex-wrap justify-end gap-2">
                  {selected.status === "prestada" ? (
                    <Button onClick={returnKey}><Check size={16} />Registrar devolucion</Button>
                  ) : (
                    <Button onClick={checkout}><KeyRound size={16} />Prestar llave</Button>
                  )}
                  <Button variant="danger" onClick={() => { dispatch({ type: "DELETE_KEY", id: selected.id }); notify("Llave eliminada"); setSelectedId(""); }}><Trash2 size={16} />Eliminar</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AdminAlertsCenter({ setSection }) {
  const { state } = useApp();
  const [detail, setDetail] = useState(null);
  const alerts = buildAdminAlerts(state);
  const priorityTone = { crítica: "red", media: "amber", informativa: "blue", ok: "green" };
  const visibleAlerts = alerts.filter((alert) => alert.priority !== "ok" || alert.id === "messages");
  const grouped = [
    ["crítica", visibleAlerts.filter((alert) => alert.priority === "crítica")],
    ["media", visibleAlerts.filter((alert) => alert.priority === "media")],
    ["informativa", visibleAlerts.filter((alert) => alert.priority === "informativa" || alert.priority === "ok")]
  ];
  return (
    <div className="grid gap-5">
      <section className="panel grid gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="section-title"><Bell size={18} />Centro de alertas operativo</h2>
            <p className="text-sm text-slate-400">Prioriza vencimientos, stock crítico, solicitudes docentes y mensajes pendientes en un solo lugar.</p>
          </div>
          <Badge tone="amber">{visibleAlerts.filter((alert) => alert.rows?.length).length} foco(s) activo(s)</Badge>
        </div>
        <div className="grid gap-4">
          {grouped.map(([priority, items]) => (
            <div key={priority} className="grid gap-3">
              <div className="flex items-center gap-2">
                <Badge tone={priorityTone[priority]}>{priority}</Badge>
                <span className="text-sm text-slate-400">{items.length} alerta(s)</span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {items.length === 0 && <div className="rounded-md border border-steel-700 bg-steel-850 p-4 text-sm text-slate-400">Sin alertas en este nivel.</div>}
                {items.map((alert) => (
                  <div key={alert.id} className="rounded-md border border-steel-700 bg-steel-850 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{alert.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{alert.body}</p>
                      </div>
                      <Badge tone={priorityTone[alert.priority] || "slate"}>{alert.rows?.length || 0}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      {alert.rows?.length > 0 && <Button variant="secondary" onClick={() => setDetail(alert)}><FileText size={16} />Ver detalle</Button>}
                      <Button onClick={() => setSection(alert.section || "dashboard")}>{alert.actionLabel || "Abrir"}</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} wide>
          <p className="mb-4 text-sm text-slate-400">{detail.body}</p>
          <DataTable rows={detail.rows || []} columns={detail.columns || []} compact />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDetail(null)}>Cerrar</Button>
            <Button onClick={() => { setDetail(null); setSection(detail.section || "dashboard"); }}>{detail.actionLabel || "Abrir módulo"}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Dashboard({ openLoans, openKeys }) {
  const { state, dispatch, notify } = useApp();
  const [detail, setDetail] = useState(null);
  const [movementDetail, setMovementDetail] = useState(null);
  const [lowStockCategory, setLowStockCategory] = useState("todas");
  const [lowStockMode, setLowStockMode] = useState("controlados");
  const [editingMaterial, setEditingMaterial] = useState(null);

  const activeLoans = state.loans.filter((l) => l.status === "activo");
  const overdue = activeLoans.filter(isOverdue);
  const overdueStudents = overdue.filter((loan) => loan.requesterType === "student");

const lowStockAll = state.materials.filter((m) =>
  isFungibleStockCategory(m) &&
  Number(m.stock || 0) < Number(m.minStock || 0)
);

const lowStockCategoryOptions = [
  ...new Set(
    lowStockAll
      .map((m) => m.category || "Sin categoría")
      .filter(Boolean)
  )
].sort();

  const lowStock = lowStockAll.filter((m) => {
    const matchesCategory =
      lowStockCategory === "todas" ||
      (m.category || "Sin categoría") === lowStockCategory;

    const matchesMode =
      lowStockMode === "todos" ||
      (lowStockMode === "controlados" && m.criticalEnabled !== false) ||
      (lowStockMode === "no_controlados" && m.criticalEnabled === false);

    return matchesCategory && matchesMode;
  });

  const dueSoon = activeLoans.filter((loan) => {
    const days = Math.ceil((new Date(loan.expectedReturn) - new Date(today())) / 86400000);
    return days >= 0 && days <= 1;
  });

  const zeroStock = state.materials.filter((m) => {
  const category = normalizeHeader(m?.category || "");

  const isFungible =
    category.includes("fungible") ||
    category.includes("material fungible");

  return (
    isFungible &&
    m.criticalEnabled !== false &&
    Number(m.stock || 0) <= 0
  );
});

  const unavailableTools = state.tools.filter((tool) =>
    ["en reparación", "dañado", "perdido", "dado de baja"].includes(tool.status)
  );

  const blockedPeopleCount = [
    ...state.students.map((p) => ["student", p.id]),
    ...state.teachers.map((p) => ["teacher", p.id])
  ].filter(([type, id]) => getBlockReason(state.loans, type, id)).length;

  const totalStockRows = state.materials.map((m) => ({
    ...m,
    status: isCriticalStockItem(m) ? "bajo" : "ok"
  }));

  const requested = Object.values(
    state.loans
      .flatMap((l) => l.items)
      .reduce((acc, item) => {
        acc[item.code] = acc[item.code] || { name: item.name, qty: 0 };
        acc[item.code].qty += Number(item.qty);
        return acc;
      }, {})
  )
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const lineData = Array.from({ length: 14 }).map((_, ix) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (13 - ix));

    const dateKey = date.toISOString().slice(0, 10);

    const prestamos = (state.loans || []).filter((loan) => {
      const loanDate = String(loan.createdAt || "").slice(0, 10);
      return loanDate === dateKey;
    }).length;

    return {
      label: date.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit"
      }),
      prestamos
    };
  });

  const kpis = [
    ["stock", "Materiales en stock", state.materials.reduce((sum, m) => sum + Number(m.stock), 0), Boxes, "blue"],
    ["activeLoans", "Préstamos activos", activeLoans.length, ClipboardList, "amber"],
    ["overdue", "Préstamos vencidos", overdue.length, AlertTriangle, "red"],
    ["lowStock", "Stock bajo", lowStock.length, Gauge, "green"]
  ];

  const detailMap = {
    stock: {
      title: "Detalle de materiales en stock",
      rows: totalStockRows,
      columns: [
        ["name", "Material"],
        ["code", "Código"],
        ["category", "Categoría"],
        ["stock", "Stock"],
        ["minStock", "Mínimo"],
        ["unit", "Unidad"],
        ["location", "Ubicación"],
        ["status", "Estado"]
      ]
    },
    activeLoans: {
      title: "Detalle de préstamos activos",
      rows: activeLoans.map((l) => ({
        ...l,
        folioText: displayFolio(l, "PRE"),
        itemsText: l.items.map((i) => `${i.name} (${i.qty}${i.nonReturnable ? ", no retorna" : ""})`).join(", "),
        days: isOverdue(l) ? overdueDays(l.expectedReturn) : 0
      })),
      columns: [
        ["folioText", "Folio"],
        ["requesterName", "Solicitante"],
        ["createdAt", "Fecha"],
        ["expectedReturn", "Devuelve"],
        ["itemsText", "Ítems"],
        ["days", "Atraso"]
      ]
    },
    overdue: {
      title: "Detalle de préstamos vencidos",
      rows: overdue.map((l) => ({
        ...l,
        folioText: displayFolio(l, "PRE"),
        itemsText: l.items.map((i) => `${i.name} (${i.qty}${i.nonReturnable ? ", no retorna" : ""})`).join(", "),
        days: overdueDays(l.expectedReturn)
      })),
      columns: [
        ["folioText", "Folio"],
        ["requesterName", "Solicitante"],
        ["expectedReturn", "Fecha esperada"],
        ["days", "Días de atraso"],
        ["itemsText", "Ítems"],
        ["notes", "Observaciones"]
      ]
    },
    lowStock: {
      title: "Detalle de materiales con stock bajo",
      rows: lowStock,
      columns: [
        ["name", "Material"],
        ["code", "Código"],
        ["stock", "Stock"],
        ["minStock", "Mínimo"],
        ["unit", "Unidad"],
        ["location", "Ubicación"]
      ]
    }
  };

  const movementFolio = movementDetail?.detail?.match(/\bPRE-\d{4}-\d{4}\b/)?.[0] || "";

  const movementLoan = movementDetail
    ? state.loans.find((loan) => loan.id === movementDetail.loanId) ||
      state.loans.find((loan) => movementFolio && displayFolio(loan, "PRE") === movementFolio)
    : null;

  const movementKey = movementDetail
    ? (state.keys || []).find((key) => key.id === movementDetail.keyId) ||
      (state.keys || []).find((key) => String(movementDetail.detail || "").includes(`Llave ${key.number}`))
    : null;

  const canReturnLoan =
    movementLoan?.status === "activo" &&
    movementDetail?.type === "salida" &&
    movementLoan.items.some((item) => !item.nonReturnable);

  const chartTooltipStyle = {
    background: "#ffffff",
    border: "1px solid #c7d2e7",
    color: "#061225",
    borderRadius: 8,
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.16)"
  };

  return (
    <div className="dashboard-control grid gap-3">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([id, label, value, Icon, tone]) => (
          <button
            key={label}
            type="button"
            onClick={() => setDetail(id)}
            className="panel dashboard-kpi text-left transition hover:border-safety-500 hover:ring-2 hover:ring-safety-500"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-1 text-2xl font-black text-white sm:text-3xl">{value}</p>
              </div>

              <div
                className={`grid h-9 w-9 place-items-center rounded-md ${
                  tone === "red"
                    ? "bg-red-500/15 text-red-300"
                    : tone === "amber"
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-sky-500/15 text-sky-300"
                }`}
              >
                <Icon size={18} />
              </div>
            </div>
          </button>
        ))}
      </section>

      {detail && (
        <Modal
          title={detailMap[detail].title}
          onClose={() => setDetail(null)}
          wide={detail === "lowStock"}
        >
          {detail === "lowStock" ? (
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-lg border border-steel-700 bg-steel-850 p-4 md:grid-cols-3">
                <Field label="Categoría">
                  <select
                    className={inputClass}
                    value={lowStockCategory}
                    onChange={(e) => setLowStockCategory(e.target.value)}
                  >
                    <option value="todas">Todas las categorías</option>
                    {lowStockCategoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Estado de control">
                  <select
                    className={inputClass}
                    value={lowStockMode}
                    onChange={(e) => setLowStockMode(e.target.value)}
                  >
                    <option value="controlados">Solo controlados</option>
                    <option value="todos">Todos los bajo stock</option>
                    <option value="no_controlados">No controlados / compra única</option>
                  </select>
                </Field>

                <div className="rounded-lg border border-steel-700 bg-steel-900 p-3 text-sm text-slate-300">
                  Mostrando{" "}
                  <strong className="text-white">{lowStock.length}</strong> de{" "}
                  <strong className="text-white">{lowStockAll.length}</strong>{" "}
                  elemento(s) bajo mínimo.
                </div>
              </div>

              <DataTable
                rows={lowStock.map((item) => ({
                  ...item,
                  controlText: item.criticalEnabled === false ? "No controlado" : "Controlado"
                }))}
                columns={[
                  ["name", "Material"],
                  ["code", "Código"],
                  ["category", "Categoría"],
                  ["stock", "Stock"],
                  ["minStock", "Mínimo"],
                  ["unit", "Unidad"],
                  ["location", "Ubicación"],
                  ["controlText", "Control"]
                ]}
                compact
                actions={(row) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      className="px-2"
                      onClick={() => setEditingMaterial(row)}
                    >
                      Revisar
                    </Button>

                    {row.criticalEnabled === false ? (
                      <Button
                        variant="ghost"
                        className="px-2 text-emerald-700"
                        onClick={() => {
                          dispatch({
                            type: "UPSERT_ENTITY",
                            collection: "materials",
                            prefix: "mat",
                            row: {
                              ...row,
                              criticalEnabled: true
                            }
                          });

                          notify("Material reincorporado al stock crítico");
                        }}
                      >
                        Controlar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="px-2 text-amber-700"
                        onClick={() => {
                          dispatch({
                            type: "UPSERT_ENTITY",
                            collection: "materials",
                            prefix: "mat",
                            row: {
                              ...row,
                              criticalEnabled: false
                            }
                          });

                          notify("Material excluido del stock crítico");
                        }}
                      >
                        No controlar
                      </Button>
                    )}
                  </div>
                )}
              />
            </div>
          ) : (
            <DataTable
              rows={detailMap[detail].rows}
              columns={detailMap[detail].columns}
              compact
            />
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Cerrar
            </Button>
          </div>
        </Modal>
      )}

      {editingMaterial && (
        <EditEntityModal
          collection="materials"
          config={configs.materials}
          initial={editingMaterial}
          onClose={() => setEditingMaterial(null)}
          onSave={(row) => {
            const finalRow = row.code
              ? row
              : {
                  ...row,
                  code: generateEntityCode(state, "materials", row)
                };

            dispatch({
              type: "UPSERT_ENTITY",
              collection: "materials",
              prefix: "mat",
              row: finalRow
            });

            notify("Material actualizado");
            setEditingMaterial(null);
          }}
        />
      )}

      {movementDetail && (
        <Modal title="Detalle de movimiento" onClose={() => setMovementDetail(null)} wide>
          <div className="grid gap-4">
            <div className="rounded-md border border-steel-700 bg-steel-850 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-white">{movementDetail.detail}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {formatDate(movementDetail.date)} · {movementDetail.requesterName || "Sin responsable"}
                  </p>
                </div>

                <Badge tone={movementDetail.type === "entrada" ? "green" : movementDetail.type === "solicitud" ? "blue" : "amber"}>
                  {movementDetail.type}
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase text-slate-500">Estado</p>
                  <p className="font-semibold text-white">{movementDetail.status || "Sin estado"}</p>
                </div>

                <div>
                  <p className="text-xs uppercase text-slate-500">Operador</p>
                  <p className="font-semibold text-white">{movementDetail.operatorName || "Sin registro"}</p>
                </div>

                <div>
                  <p className="text-xs uppercase text-slate-500">Folio</p>
                  <p className="font-semibold text-white">{movementFolio || movementLoan?.folio || "No asociado"}</p>
                </div>
              </div>
            </div>

            {movementLoan && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-white">Items del prestamo</h3>
                <DataTable
                  rows={movementLoan.items.map((item) => ({
                    ...item,
                    returnMode: item.nonReturnable ? "No retorna" : "Debe volver"
                  }))}
                  columns={[
                    ["name", "Item"],
                    ["code", "Codigo"],
                    ["type", "Tipo"],
                    ["qty", "Cantidad"],
                    ["returnMode", "Retorno"]
                  ]}
                  compact
                />
              </div>
            )}

            {movementKey && (
              <div className="rounded-md border border-steel-700 bg-steel-850 p-4">
                <p className="font-bold text-white">
                  Llave {movementKey.number} · {movementKey.name}
                </p>
                <p className="text-sm text-slate-400">
                  Estado: {movementKey.status} · Responsable actual: {movementKey.responsible || "En panol"}
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setMovementDetail(null)}>
                Cerrar
              </Button>

              {movementKey && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMovementDetail(null);
                    openKeys?.();
                  }}
                >
                  Abrir control de llaves
                </Button>
              )}

              {canReturnLoan && (
                <Button
                  onClick={() => {
                    setMovementDetail(null);
                    openLoans?.("return", movementLoan.id);
                  }}
                >
                  <RotateCcw size={16} />
                  Registrar devolucion
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      <section className="panel dashboard-alerts">
        <h2 className="section-title">
          <AlertTriangle size={18} />
          Alertas inteligentes
        </h2>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <AlertTile label="Stock en cero" value={zeroStock.length} tone="red" />
          <AlertTile label="Préstamos por vencer" value={dueSoon.length} tone="amber" />
          <AlertTile label="Personas bloqueadas" value={blockedPeopleCount} tone="red" />
          <AlertTile label="Herramientas no disponibles" value={unavailableTools.length} tone="amber" />
        </div>
      </section>

      <section className="dashboard-chart-row grid gap-3 xl:grid-cols-2">
        <ChartPanel title="Top 5 materiales solicitados">
          <ResponsiveContainer width="100%" height={145}>
            <BarChart data={requested}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#061225" }} />
              <Bar dataKey="qty" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Préstamos por día">
          <ResponsiveContainer width="100%" height={145}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="label" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#061225" }} />
              <Line
                type="monotone"
                dataKey="prestamos"
                stroke="#38bdf8"
                strokeWidth={3}
                dot={{ fill: "#38bdf8" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(420px,1.2fr)_minmax(0,0.8fr)]">
        <div className="panel dashboard-table-panel xl:order-2">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="section-title mb-0">
              <AlertTriangle size={18} />
              Alertas de stock crítico
            </h2>

            <Button
              variant="secondary"
              className="px-3 py-2"
              onClick={() => setDetail("lowStock")}
            >
              Ver todo
            </Button>
          </div>

          <DataTable
            rows={lowStock.slice(0, 4)}
            columns={[
              ["name", "Material"],
              ["code", "Código"],
              ["stock", "Stock"],
              ["minStock", "Mínimo"],
              ["location", "Ubicación"]
            ]}
            compact
          />
        </div>

        <div className="panel dashboard-movements-panel xl:order-1">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="section-title mb-0">
              <History size={18} />
              Últimos movimientos
            </h2>

            <p className="text-sm text-slate-400">
              Haz clic para ver detalle y acciones.
            </p>
          </div>

          <div className="dashboard-movements-list space-y-2">
            {state.movements.slice(0, 10).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMovementDetail(m)}
                className="w-full rounded-md border border-steel-700 bg-steel-850 px-3 py-3 text-left transition hover:border-safety-500 hover:bg-steel-800 hover:ring-2 hover:ring-safety-500/30"
              >
                <div className="flex justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-semibold text-white">{m.detail}</p>
                  <Badge tone={m.type === "entrada" ? "green" : m.type === "solicitud" ? "blue" : "amber"}>
                    {m.type}
                  </Badge>
                </div>

                <p className="mt-1 truncate text-xs text-slate-400">
                  {formatDate(m.date)} · {m.requesterName || "Sin responsable"}
                </p>
              </button>
            ))}

            {state.movements.length === 0 && (
              <div className="rounded-md border border-steel-700 bg-steel-850 p-4 text-center text-sm text-slate-400">
                Sin movimientos registrados
              </div>
            )}
          </div>
        </div>
      </section>

    {overdueStudents.length > 0 && (
      <section className="panel">
        <h2 className="section-title">
          <RotateCcw size={18} />
          Alumnos pendientes con atraso
        </h2>

        <DataTable
          rows={overdueStudents.map((l) => ({
            ...l,
            folioText: displayFolio(l, "PRE"),
            days: overdueDays(l.expectedReturn)
          }))}
          columns={[
            ["folioText", "Folio"],
            ["requesterName", "Alumno"],
            ["expectedReturn", "Fecha esperada"],
            ["days", "Días de atraso"],
            ["notes", "Observaciones"]
          ]}
          compact
        />
      </section>
    )}
    </div>
  );
}

function ChartPanel({ title, children }) {
  return <div className="panel dashboard-chart-panel"><h2 className="section-title"><BarChart3 size={18} />{title}</h2>{children}</div>;
}

function AlertTile({ label, value, tone }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${tone === "red" ? "border-red-500/35 bg-red-500/10 text-red-200" : "border-amber-500/35 bg-amber-500/10 text-amber-200"}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function buildAdminAiContext(state) {
  const activeLoans = state.loans.filter((loan) => loan.status === "activo");
  const overdue = activeLoans.filter(isOverdue);
  const dueSoon = activeLoans.filter((loan) => {
    const days = Math.ceil((new Date(loan.expectedReturn) - new Date(today())) / 86400000);
    return days >= 0 && days <= 2;
  });
  const loanedTools = activeLoans.flatMap((loan) => loan.items.filter((item) => item.type === "tool").map((item) => ({ ...item, requesterName: loan.requesterName, expectedReturn: loan.expectedReturn, folio: displayFolio(loan, "PRE") })));
  const materialUse = Object.values(state.loans.flatMap((loan) => loan.items).reduce((acc, item) => {
    const key = item.code || item.name;
    acc[key] = acc[key] || { name: item.name, code: item.code, qty: 0 };
    acc[key].qty += Number(item.qty || 1);
    return acc;
  }, {})).sort((a, b) => b.qty - a.qty).slice(0, 10);
  const blockedPeople = [...state.students.map((person) => ({ ...person, type: "student" })), ...state.teachers.map((person) => ({ ...person, type: "teacher" }))]
    .map((person) => ({ ...person, blockReason: getBlockReason(state.loans, person.type, person.id) }))
    .filter((person) => person.blockReason);
  return {
    today: today(),
    counts: {
      activeLoans: activeLoans.length,
      overdueLoans: overdue.length,
      dueSoonLoans: dueSoon.length,
      blockedPeople: blockedPeople.length,
      loanedTools: loanedTools.length,
      pendingTeacherRequests: (state.requests || []).filter((request) => request.status === "pendiente").length
    },
    overdue,
    dueSoon,
    loanedTools,
    blockedPeople,
    materialUse,
    requests: (state.requests || []).slice(0, 50),
    recentLoans: state.loans.slice(0, 80),
    tools: state.tools,
    lowStock: state.materials.filter(isCriticalStockItem).slice(0, 60)
  };
}

function localAdminLoanAnalysis(state) {
  const context = buildAdminAiContext(state);
  const actions = [];
  if (context.overdue.length) actions.push(`Contactar a ${context.overdue.length} solicitante(s) con préstamos vencidos.`);
  if (context.dueSoon.length) actions.push(`Preparar recordatorio para ${context.dueSoon.length} préstamo(s) que vencen pronto.`);
  if (context.loanedTools.length) actions.push(`Revisar ${context.loanedTools.length} herramienta(s) actualmente fuera del pañol.`);
  if (context.blockedPeople.length) actions.push(`Mantener bloqueo de ${context.blockedPeople.length} persona(s) hasta regularizar devolución.`);
  if (!actions.length) actions.push("No hay riesgos urgentes detectados en préstamos activos.");
  return {
    title: "Análisis local de préstamos",
    summary: `Activos: ${context.counts.activeLoans}. Vencidos: ${context.counts.overdueLoans}. Por vencer: ${context.counts.dueSoonLoans}. Herramientas prestadas: ${context.counts.loanedTools}.`,
    bullets: actions,
    tables: [
      { title: "Préstamos vencidos", rows: context.overdue.slice(0, 8).map((loan) => ({ folio: displayFolio(loan, "PRE"), solicitante: loan.requesterName, vence: formatDate(loan.expectedReturn), atraso: overdueDays(loan.expectedReturn) })) },
      { title: "Herramientas fuera del pañol", rows: context.loanedTools.slice(0, 8).map((item) => ({ folio: item.folio, herramienta: item.name, solicitante: item.requesterName, vence: formatDate(item.expectedReturn) })) }
    ]
  };
}

function localAdminQuestionAnswer(state, question) {
  const text = normalizeHeader(question);
  const context = buildAdminAiContext(state);
  if (!question.trim()) return null;
  if (text.includes("urgencia") || text.includes("hoy")) {
    const alerts = buildAdminAlerts(state).filter((alert) => alert.rows?.length);
    return { title: "Urgencias para hoy", summary: alerts.length ? `Detecté ${alerts.length} foco(s) operativos que conviene revisar.` : "No hay urgencias críticas registradas.", bullets: alerts.slice(0, 8).map((alert) => `${alert.title}: ${alert.body}`) };
  }
  if (text.includes("reponer") || text.includes("comprar") || text.includes("stock")) {
    const items = state.materials.filter((item) => Number(item.stock || 0) < Number(item.minStock || 0)).sort((a, b) => (Number(a.stock || 0) - Number(a.minStock || 0)) - (Number(b.stock || 0) - Number(b.minStock || 0)));
    return { title: "Reposición sugerida", summary: items.length ? `${items.length} material(es) están bajo mínimo.` : "No detecté materiales bajo mínimo.", bullets: items.slice(0, 12).map((item) => `${item.name} (${item.code || "s/c"}): stock ${item.stock}, mínimo ${item.minStock}`) };
  }
  if (text.includes("sin respuesta") || text.includes("solicitudes docentes")) {
    const pending = (state.requests || []).filter((request) => ["pendiente", "en preparación"].includes(request.status));
    return { title: "Solicitudes que requieren gestión", summary: pending.length ? `${pending.length} solicitud(es) pendientes o en preparación.` : "No hay solicitudes docentes pendientes.", bullets: pending.slice(0, 12).map((request) => `${displayFolio(request, "SOL")} · ${request.requesterName} · ${request.status} · ${request.items.length} ítem(s)`) };
  }
  if (text.includes("venc") || text.includes("atras")) {
    return { title: "Préstamos vencidos", summary: context.overdue.length ? `Hay ${context.overdue.length} préstamo(s) vencidos.` : "No hay préstamos vencidos.", bullets: context.overdue.slice(0, 10).map((loan) => `${displayFolio(loan, "PRE")} · ${loan.requesterName} · ${overdueDays(loan.expectedReturn)} día(s) de atraso`) };
  }
  if (text.includes("herramient") || text.includes("fuera") || text.includes("prestada")) {
    return { title: "Herramientas fuera del pañol", summary: context.loanedTools.length ? `Hay ${context.loanedTools.length} herramienta(s) prestadas.` : "No hay herramientas prestadas activas.", bullets: context.loanedTools.slice(0, 12).map((item) => `${item.folio} · ${item.name} · ${item.requesterName} · vence ${formatDate(item.expectedReturn)}`) };
  }
  if (text.includes("bloque")) {
    return { title: "Personas bloqueadas", summary: context.blockedPeople.length ? `Hay ${context.blockedPeople.length} persona(s) bloqueadas.` : "No hay personas bloqueadas.", bullets: context.blockedPeople.slice(0, 12).map((person) => `${person.name}: ${person.blockReason}`) };
  }
  if (text.includes("mas pedido") || text.includes("solicitado") || text.includes("ranking")) {
    return { title: "Ítems más solicitados", summary: "Ranking calculado con el historial registrado.", bullets: context.materialUse.slice(0, 10).map((item) => `${item.name} (${item.code || "s/c"}): ${item.qty}`) };
  }
  const people = [...state.students.map((person) => ({ ...person, typeLabel: "Alumno" })), ...state.teachers.map((person) => ({ ...person, typeLabel: "Profesor" }))];
  const person = people.find((candidate) => text.includes(normalizeHeader(candidate.name).split(" ")[0]) || normalizeHeader(candidate.name).includes(text));
  if (person) {
    const loans = state.loans.filter((loan) => loan.requesterId === person.id || normalizeHeader(loan.requesterName) === normalizeHeader(person.name));
    const requests = (state.requests || []).filter((request) => request.requesterId === person.id || normalizeHeader(request.requesterName) === normalizeHeader(person.name));
    return { title: `Historial de ${person.name}`, summary: `${person.typeLabel}. Préstamos: ${loans.length}. Solicitudes: ${requests.length}.`, bullets: [...loans.slice(0, 8).map((loan) => `${displayFolio(loan, "PRE")} · ${loan.status} · ${loan.items.map((item) => `${item.name} (${item.qty})`).join(", ")}`), ...requests.slice(0, 5).map((request) => `${displayFolio(request, "SOL")} · ${request.status} · ${request.items.map((item) => `${item.name} (${item.qty})`).join(", ")}`)] };
  }
  return localAdminLoanAnalysis(state);
}

function buildAdminAlerts(state) {
  const dueSoonDays = Number(state.settings?.loanDueSoonDays ?? 2);
  const dueLimit = addDays(dueSoonDays);
  const activeLoans = state.loans.filter((loan) => loan.status === "activo");
  const overdue = activeLoans.filter(isOverdue);
  const dueSoon = activeLoans.filter((loan) => !isOverdue(loan) && loan.expectedReturn <= dueLimit);
  const zeroStock = state.materials.filter(
    (item) =>
      isFungibleStockCategory(item) &&
      item.criticalEnabled !== false &&
      Number(item.stock || 0) <= 0
  );

  const lowStock = state.materials.filter(isCriticalStockItem);
  const pendingRequests = (state.requests || []).filter((request) => request.status === "pendiente");
  const preparingRequests = (state.requests || []).filter((request) => request.status === "en preparación");
  const unreadMessages = (state.messages || []).filter((msg) => msg.from === "docente" && !msg.adminRead);
  const unavailableTools = state.tools.filter((tool) => tool.status !== "disponible");
  const blockedPeople = [
    ...state.students.map((person) => ({ ...person, typeLabel: "Alumno", requesterType: "student" })),
    ...state.teachers.map((person) => ({ ...person, typeLabel: "Profesor", requesterType: "teacher" }))
  ].map((person) => ({ ...person, blockReason: getBlockReason(state.loans, person.requesterType, person.id) })).filter((person) => person.blockReason);
  return [
    {
      id: "overdue",
      priority: overdue.length ? "crítica" : "ok",
      title: "Préstamos vencidos",
      body: overdue.length ? `${overdue.length} préstamo(s) necesitan gestión de devolución.` : "Sin préstamos vencidos.",
      section: "loans",
      actionLabel: "Ir a devoluciones",
      rows: overdue.map((loan) => ({ folio: displayFolio(loan, "PRE"), solicitante: loan.requesterName, fecha: loan.expectedReturn, atraso: overdueDays(loan.expectedReturn), items: loan.items.map((item) => `${item.name} (${item.qty})`).join(", ") })),
      columns: [["folio", "Folio"], ["solicitante", "Solicitante"], ["fecha", "Fecha esperada"], ["atraso", "Días"], ["items", "Ítems"]]
    },
    {
      id: "zero-stock",
      priority: zeroStock.length ? "crítica" : "ok",
      title: "Stock en cero",
      body: zeroStock.length ? `${zeroStock.length} material(es) no tienen unidades disponibles.` : "Sin materiales en cero.",
      section: "inventory",
      actionLabel: "Ver inventario",
      rows: zeroStock.map((item) => ({ name: item.name, code: item.code, stock: item.stock, minStock: item.minStock, location: item.location })),
      columns: [["name", "Material"], ["code", "Código"], ["stock", "Stock"], ["minStock", "Mínimo"], ["location", "Ubicación"]]
    },
    {
      id: "low-stock",
      priority: lowStock.length ? "media" : "ok",
      title: "Stock bajo",
      body: lowStock.length ? `${lowStock.length} material(es) están bajo el mínimo.` : "Stock crítico controlado.",
      section: "inventory",
      actionLabel: "Revisar stock",
      rows: lowStock.map((item) => ({ name: item.name, code: item.code, stock: item.stock, minStock: item.minStock, location: item.location })),
      columns: [["name", "Material"], ["code", "Código"], ["stock", "Stock"], ["minStock", "Mínimo"], ["location", "Ubicación"]]
    },
    {
      id: "due-soon",
      priority: dueSoon.length ? "media" : "ok",
      title: "Préstamos por vencer",
      body: dueSoon.length ? `${dueSoon.length} préstamo(s) vencen dentro de ${dueSoonDays} día(s).` : "Sin vencimientos próximos.",
      section: "loans",
      actionLabel: "Ver préstamos",
      rows: dueSoon.map((loan) => ({ folio: displayFolio(loan, "PRE"), solicitante: loan.requesterName, fecha: loan.expectedReturn, items: loan.items.map((item) => `${item.name} (${item.qty})`).join(", ") })),
      columns: [["folio", "Folio"], ["solicitante", "Solicitante"], ["fecha", "Fecha esperada"], ["items", "Ítems"]]
    },
    {
      id: "requests",
      priority: pendingRequests.length || preparingRequests.length ? "media" : "ok",
      title: "Solicitudes docentes",
      body: `${pendingRequests.length} pendiente(s), ${preparingRequests.length} en preparación.`,
      section: "requests",
      actionLabel: "Abrir solicitudes",
      rows: [...pendingRequests, ...preparingRequests].map((request) => ({ folio: displayFolio(request, "SOL"), docente: request.requesterName, estado: request.status, fecha: request.expectedDate, items: request.items.map((item) => `${item.name} (${item.qty})`).join(", ") })),
      columns: [["folio", "Folio"], ["docente", "Docente"], ["estado", "Estado"], ["fecha", "Fecha requerida"], ["items", "Ítems"]]
    },
    {
      id: "messages",
      priority: unreadMessages.length ? "media" : "ok",
      title: "Mensajes sin leer",
      body: unreadMessages.length ? `${unreadMessages.length} mensaje(s) requieren respuesta.` : "No hay mensajes nuevos.",
      section: "messages",
      actionLabel: "Abrir chat",
      rows: unreadMessages.map((msg) => ({ docente: msg.teacherName, fecha: msg.date, hora: msg.time, mensaje: msg.body })),
      columns: [["docente", "Docente"], ["fecha", "Fecha"], ["hora", "Hora"], ["mensaje", "Mensaje"]]
    },
    {
      id: "blocked",
      priority: blockedPeople.length ? "crítica" : "ok",
      title: "Personas bloqueadas",
      body: blockedPeople.length ? `${blockedPeople.length} persona(s) bloqueadas por pendientes.` : "No hay bloqueos activos.",
      section: "people",
      actionLabel: "Ver personas",
      rows: blockedPeople.map((person) => ({ nombre: person.name, tipo: person.typeLabel, motivo: person.blockReason })),
      columns: [["nombre", "Nombre"], ["tipo", "Tipo"], ["motivo", "Motivo"]]
    },
    {
      id: "tools",
      priority: unavailableTools.length ? "informativa" : "ok",
      title: "Herramientas no disponibles",
      body: unavailableTools.length ? `${unavailableTools.length} herramienta(s) están prestadas o en reparación.` : "Herramientas disponibles controladas.",
      section: "inventory",
      actionLabel: "Ver herramientas",
      rows: unavailableTools.map((tool) => ({ name: tool.name, code: tool.code, estado: tool.status, description: tool.description })),
      columns: [["name", "Herramienta"], ["code", "Código"], ["estado", "Estado"], ["description", "Descripción"]]
    }
  ];
}

function AdminAssistant() {
  const { state } = useApp();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(() => localAdminLoanAnalysis(state));
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState("local");
  const quickPrompts = [
    "Resumen de urgencias para hoy",
    "Qué materiales conviene reponer primero",
    "Qué personas tienen pendientes o bloqueos",
    "Qué solicitudes docentes siguen sin respuesta",
    "Qué herramientas están fuera del pañol"
  ];
  const askAssistant = async (mode = "question", promptOverride = question) => {
    const localAnswer = mode === "loan-analysis" ? localAdminLoanAnalysis(state) : localAdminQuestionAnswer(state, promptOverride);
    setAnswer(localAnswer);
    setSource("local");
    if (!isSupabaseConfigured || !supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("panol-assistant", {
        body: { mode, question: promptOverride, context: buildAdminAiContext(state) }
      });
      if (error || !data?.answer) throw error || new Error("Sin respuesta IA");
      setAnswer(data.answer);
      setSource("ia");
    } catch (error) {
      console.info("Asistente IA no disponible, usando análisis local", error);
      setSource("local");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="grid gap-4">
      <section className="panel grid gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="flex-1">
            <h2 className="section-title"><Wand2 size={18} />Asistente IA del pañol</h2>
            <Field label="Pregunta en lenguaje natural">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} />
                <input className={`${inputClass} pl-10`} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ej: qué herramientas están fuera, quién tiene atrasos, qué pidió Romero" onKeyDown={(event) => { if (event.key === "Enter") askAssistant("question"); }} />
              </div>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => askAssistant("question")} disabled={loading || !question.trim()}><Search size={16} />Preguntar</Button>
            <Button variant="secondary" onClick={() => askAssistant("loan-analysis")} disabled={loading}><Wand2 size={16} />Analizar préstamos</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => <Button key={prompt} variant="secondary" onClick={() => { setQuestion(prompt); askAssistant("question", prompt); }}><Wand2 size={15} />{prompt}</Button>)}
        </div>
      </section>
      <section className="panel grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{answer?.title || "Resultado"}</h3>
            <p className="mt-1 text-sm text-slate-400">{answer?.summary}</p>
          </div>
          <Badge tone={source === "ia" ? "blue" : "amber"}>{loading ? "analizando" : source === "ia" ? "IA" : "local"}</Badge>
        </div>
        {answer?.bullets?.length > 0 && (
          <div className="grid gap-2">
            {answer.bullets.map((item, index) => <div key={`${item}-${index}`} className="rounded-md border border-steel-700 bg-steel-850 px-3 py-2 text-sm text-slate-200">{item}</div>)}
          </div>
        )}
        {answer?.tables?.map((table) => (
          <div key={table.title} className="grid gap-2">
            <h4 className="font-semibold text-white">{table.title}</h4>
            <DataTable rows={table.rows || []} columns={Object.keys(table.rows?.[0] || {}).map((key) => [key, key])} compact />
          </div>
        ))}
      </section>
    </div>
  );
}

const configs = {
  students: { title: "Alumnos", icon: GraduationCap, prefix: "alu", fields: [["name", "Nombre"], ["rut", "RUT/ID"], ["course", "Carrera/curso"], ["email", "Email"], ["phone", "Teléfono"]], columns: [["name", "Nombre"], ["rut", "RUT/ID"], ["course", "Curso"], ["email", "Email"], ["phone", "Teléfono"]] },
  teachers: { title: "Profesores", icon: UserRound, prefix: "pro", fields: [["name", "Nombre"], ["department", "Departamento"], ["email", "Email"]], columns: [["name", "Nombre"], ["department", "Departamento"], ["email", "Email"]] },
  materials: { title: "Materiales", icon: Boxes, prefix: "mat", fields: [["name", "Nombre"], ["code", "Código"], ["category", "Categoría"], ["stock", "Stock actual", "number"], ["minStock", "Stock mínimo", "number"], ["unit", "Unidad"], ["location", "Ubicación"]], columns: [["name", "Nombre"], ["code", "Código"], ["category", "Categoría"], ["stock", "Stock"], ["minStock", "Mínimo"], ["unit", "Unidad"], ["location", "Ubicación"]] },
  tools: { title: "Herramientas", icon: Hammer, prefix: "her", fields: [["name", "Nombre"], ["code", "Código"], ["status", "Estado"], ["description", "Descripción"]], columns: [["name", "Nombre"], ["code", "Código"], ["status", "Estado"], ["description", "Descripción"]] }
};

const inferCodePrefix = (collection, category = "") => {
  if (collection === "tools") return "HER";
  const normalized = normalizeHeader(category);
  if (normalized.includes("herramient")) return "HER";
  if (normalized.includes("maqueta")) return "MAQ";
  if (normalized.includes("instrument")) return "INS";
  if (normalized.includes("fungible")) return "FUN";
  if (normalized.includes("epp") || normalized.includes("seguridad")) return "EPP";
  if (normalized.includes("electr")) return "ELE";
  return "MAT";
};

function generateEntityCode(state, collection, row = {}) {
  const list = state[collection] || [];
  const category = row.category || "";
  const normalizedCategory = normalizeHeader(category);
  const sameCategory = collection === "materials" && normalizedCategory
    ? list.filter((item) => normalizeHeader(item.category || "") === normalizedCategory)
    : list;
  const prefixCounts = sameCategory.reduce((acc, item) => {
    const match = String(item.code || "").trim().match(/^([A-Z]+)-?(\d+)$/i);
    if (!match) return acc;
    const prefix = match[1].toUpperCase();
    acc[prefix] = (acc[prefix] || 0) + 1;
    return acc;
  }, {});
  const detectedPrefix = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const prefix = detectedPrefix || inferCodePrefix(collection, category);
  const codesWithPrefix = list
    .map((item) => String(item.code || "").trim().match(new RegExp(`^${prefix}-?(\\d+)$`, "i")))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const nextNumber = (codesWithPrefix.length ? Math.max(...codesWithPrefix) : 0) + 1;
  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
}

function People() {
  const [tab, setTab] = useState("students");
  const config = configs[tab];
  const tabs = ["students", "teachers"];
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((key) => {
          const cfg = configs[key];
          const Icon = cfg.icon;
          return <Button key={key} variant={tab === key ? "primary" : "secondary"} onClick={() => setTab(key)}><Icon size={16} />{cfg.title}</Button>;
        })}
      </div>
      <CrudTable collection={tab} config={config} />
    </div>
  );
}

function Inventory() {
  const tab = "materials";
  const config = configs[tab];

  return (
    <div className="grid gap-5">
      <CrudTable collection={tab} config={config} />
    </div>
  );
}

function InventoryBulkPanel() {
  const { state, dispatch, notify } = useApp();
  const categories = [...new Set(state.materials.map((item) => item.category || "Sin categoría"))].sort();
  const [category, setCategory] = useState(categories[0] || "");
  const [minStock, setMinStock] = useState("");
  const [location, setLocation] = useState("");
  const selectedRows = state.materials.filter((item) => (item.category || "Sin categoría") === category);
  const applyBulk = () => {
    if (!selectedRows.length) return notify("No hay materiales para actualizar", "error");
    selectedRows.forEach((item) => {
      dispatch({ type: "UPSERT_ENTITY", collection: "materials", prefix: "mat", row: { ...item, minStock: minStock === "" ? item.minStock : Number(minStock), location: location.trim() || item.location } });
    });
    notify(`Acción masiva aplicada a ${selectedRows.length} material(es)`);
    setMinStock("");
    setLocation("");
  };
  return (
    <div className="rounded-md border border-steel-700 bg-steel-850 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <h2 className="section-title"><Boxes size={18} />Acciones masivas de inventario</h2>
          <p className="text-sm text-slate-400">Actualiza mínimos o ubicación para una categoría completa sin editar material por material.</p>
        </div>
        <Field label="Categoría"><select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
        <Field label="Nuevo mínimo"><input className={inputClass} type="number" min="0" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="mantener" /></Field>
        <Field label="Nueva ubicación"><input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="mantener" /></Field>
        <Button onClick={applyBulk} disabled={!category}><Save size={16} />Aplicar a {selectedRows.length}</Button>
      </div>
    </div>
  );
}


function CrudTable({ collection, config }) {
  const { state, dispatch, notify } = useApp();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [profile, setProfile] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [maxStock, setMaxStock] = useState("");
  const [sortMode, setSortMode] = useState("az");

  const hasPersonProfile = collection === "students" || collection === "teachers";
  const isMaterials = collection === "materials";

  const categoryOptions = isMaterials
    ? [...new Set((state.materials || []).map((item) => item.category || "Sin categoría"))].sort()
    : [];

  const stockValues = isMaterials
    ? (state.materials || []).map((item) => Number(item.stock) || 0)
    : [];

  const highestStock = stockValues.length ? Math.max(...stockValues) : 0;
  const stockLimit = maxStock === "" ? highestStock : Number(maxStock);

  const rows = state[collection]
    .filter((row) => {
      const { photoUrl, ...searchable } = row;

      const matchesSearch = JSON.stringify(searchable)
        .toLowerCase()
        .includes(query.toLowerCase());

      const matchesCategory =
        !isMaterials ||
        selectedCategory === "todos" ||
        (row.category || "Sin categoría") === selectedCategory;

      const matchesStock =
        !isMaterials ||
        maxStock === "" ||
        Number(row.stock || 0) <= stockLimit;

      return matchesSearch && matchesCategory && matchesStock;
    })
    .sort((a, b) => {
      if (sortMode === "az") {
        return String(a.name || "").localeCompare(String(b.name || ""), "es", {
          sensitivity: "base"
        });
      }

      if (sortMode === "za") {
        return String(b.name || "").localeCompare(String(a.name || ""), "es", {
          sensitivity: "base"
        });
      }

      if (sortMode === "stock_desc") {
        return Number(b.stock || 0) - Number(a.stock || 0);
      }

      if (sortMode === "stock_asc") {
        return Number(a.stock || 0) - Number(b.stock || 0);
      }

      return 0;
    });

  const perPage = 20;
  const pageRows = rows.slice((page - 1) * perPage, page * perPage);
  const tableColumns = collection === "students" ? [["photoPreview", "Foto"], ...config.columns] : config.columns;
  const tableRows = pageRows;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));

  const activeFiltersCount =
    (selectedCategory !== "todos" ? 1 : 0) +
    (maxStock !== "" ? 1 : 0) +
    (sortMode !== "az" ? 1 : 0);

  const normalizeInventoryCategories = () => {
    const normalizeCategory = (value = "") => {
      const clean = String(value)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      if (
        clean.includes("fungible") ||
        clean === "fun" ||
        clean === "fungibles"
      ) {
        return "Material Fungible";
      }

      if (
        clean.includes("herramienta") ||
        clean.includes("herramientas") ||
        clean === "her"
      ) {
        return "Herramientas";
      }

      if (
        clean.includes("instrument") ||
        clean.includes("intrument") ||
        clean.includes("instrum")
      ) {
        return "Instrumentación";
      }

      if (
        clean.includes("maqueta") ||
        clean.includes("didactica") ||
        clean.includes("didacticas")
      ) {
        return "Maquetas Didácticas";
      }

      return value || "Sin categoría";
    };

    const updatedMaterials = (state.materials || []).map((material) => ({
      ...material,
      category: normalizeCategory(material.category)
    }));

    dispatch({
      type: "HYDRATE_STATE",
      state: {
        ...state,
        materials: updatedMaterials
      }
    });

    notify("Categorías normalizadas correctamente");
    setSelectedCategory("todos");
    setPage(1);
  };

  const save = (row) => {
    const finalRow = row.code ? row : { ...row, code: generateEntityCode(state, collection, row) };

    dispatch({
      type: "UPSERT_ENTITY",
      collection,
      prefix: config.prefix,
      row: finalRow
    });

    notify(`${config.title.slice(0, -1) || config.title} guardado`);
    setEditing(null);
  };

  return (
    <div className={isMaterials ? "grid items-start gap-4 lg:grid-cols-[260px_1fr]" : "grid gap-4"}>
      {isMaterials && (
        <aside className="self-start lg:sticky lg:top-6">
          <div className="panel">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-950">Filtros</h3>
                <p className="text-xs text-slate-500">
                  Filtra el inventario en tiempo real.
                </p>
              </div>

              {activeFiltersCount > 0 && (
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-safety-500 px-2 text-xs font-bold text-steel-950">
                  {activeFiltersCount}
                </span>
              )}
            </div>

            <div className="grid gap-5">
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-slate-900">Categoría</p>

                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("todos");
                      setPage(1);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                      selectedCategory === "todos"
                        ? "border-safety-500 bg-safety-500 text-steel-950"
                        : "border-slate-200 bg-white text-slate-700 hover:border-safety-500 hover:bg-yellow-50"
                    }`}
                  >
                    <Boxes size={16} />
                    Todos
                  </button>

                  {categoryOptions.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(category);
                        setPage(1);
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                        selectedCategory === category
                          ? "border-safety-500 bg-safety-500 text-steel-950"
                          : "border-slate-200 bg-white text-slate-700 hover:border-safety-500 hover:bg-yellow-50"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <p className="text-sm font-semibold text-slate-900">Ordenar por</p>

                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400"
                  value={sortMode}
                  onChange={(e) => {
                    setSortMode(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="az">Nombre A-Z</option>
                  <option value="za">Nombre Z-A</option>
                  <option value="stock_desc">Mayor cantidad</option>
                  <option value="stock_asc">Menor cantidad</option>
                </select>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Cantidad</p>

                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700">
                    ≤ {maxStock === "" ? highestStock : stockLimit}
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max={highestStock}
                  value={maxStock === "" ? highestStock : stockLimit}
                  onChange={(e) => {
                    setMaxStock(e.target.value);
                    setPage(1);
                  }}
                  className="w-full accent-yellow-400"
                />

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">0</span>

                  <input
                    className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-yellow-400"
                    type="number"
                    min="0"
                    max={highestStock}
                    value={maxStock}
                    onChange={(e) => {
                      setMaxStock(e.target.value);
                      setPage(1);
                    }}
                    placeholder={String(highestStock)}
                  />

                  <span className="text-xs text-slate-500">{highestStock}</span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Mostrando <strong className="text-slate-950">{rows.length}</strong> material(es).
              </div>

              <div className="grid gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMaxStock("");
                    setSelectedCategory("todos");
                    setSortMode("az");
                    setPage(1);
                  }}
                >
                  Limpiar filtros
                </Button>

                <Button variant="ghost" onClick={normalizeInventoryCategories}>
                  <RotateCcw size={16} />
                  Normalizar categorías
                </Button>
              </div>
            </div>
          </div>
        </aside>
      )}

      <div className="panel">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} />

            <input
              className={`${inputClass} pl-10`}
              placeholder={`Buscar en ${config.title.toLowerCase()}`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <Button onClick={() => setEditing({})}>
            <Plus size={16} />
            Agregar
          </Button>
        </div>

        <DataTable
          rows={tableRows}
          columns={tableColumns}
          actions={(row) => (
            <div className="flex justify-end gap-2">
              {hasPersonProfile && (
                <Button variant="ghost" className="px-2" onClick={() => setProfile(row)}>
                  <UserRound size={16} />
                </Button>
              )}

              <Button variant="ghost" className="px-2" onClick={() => setEditing(row)}>
                <Edit3 size={16} />
              </Button>

              <Button variant="ghost" className="px-2 text-red-300" onClick={() => setDeleting(row)}>
                <Trash2 size={16} />
              </Button>
            </div>
          )}
        />

        <Pager page={page} pages={pages} setPage={setPage} />

        {editing && (
          <EditEntityModal
            collection={collection}
            config={config}
            initial={editing}
            onClose={() => setEditing(null)}
            onSave={save}
          />
        )}

        {deleting && (
          <ConfirmModal
            title={`Eliminar ${config.singular}`}
            body={`¿Seguro que deseas eliminar "${deleting.name || deleting.code || "este registro"}"?`}
            onCancel={() => setDeleting(null)}
            onConfirm={() => {
              dispatch({
                type: "DELETE_ENTITY",
                collection,
                id: deleting.id
              });

              notify("Registro eliminado");
              setDeleting(null);
            }}
          />
        )}

        {profile && (
          <PersonProfileModal
            person={profile}
            type={collection === "students" ? "student" : "teacher"}
            onClose={() => setProfile(null)}
          />
        )}
      </div>
    </div>
  );
}
function PersonProfileModal({ person, type, onClose }) {
  const { state, notify } = useApp();
  const [sendingPendingEmail, setSendingPendingEmail] = useState(false);
  const typeLabel = type === "student" ? "Alumno" : "Profesor";
  const loans = state.loans.filter((loan) => loan.requesterId === person.id || normalizeHeader(loan.requesterName) === normalizeHeader(person.name));
  const activeLoans = loans.filter((loan) => loan.status === "activo");
  const requests = type === "teacher" ? (state.requests || []).filter((request) => request.requesterId === person.id || normalizeHeader(request.requesterName) === normalizeHeader(person.name)) : [];
  const messages = type === "teacher" ? (state.messages || []).filter((msg) => msg.teacherId === person.id) : [];
  const pendingReturnLoans = type === "teacher" ? getTeacherPendingReturnLoans(state.loans || [], person) : [];
  const sendPendingEmail = async () => {
    if (!person.email || !pendingReturnLoans.length) return;
    setSendingPendingEmail(true);
    try {
      const result = await sendEmailWithFallback(buildPendingReturnsEmailPayload(person, pendingReturnLoans));
      notify(result.mode === "mailto" ? "Resend esta limitado. Se abrio Outlook con el recordatorio listo para enviar." : "Correo de pendientes enviado al profesor");
    } catch (error) {
      notify(`No se pudo enviar el correo: ${error.message || error}`, "error");
    } finally {
      setSendingPendingEmail(false);
    }
  };
  const pendingNotice = getPendingLoanNotice(state.loans, type, person.id);
  const blockReason = getBlockReason(state.loans, type, person.id);
  return (
    <Modal title={`Ficha rápida · ${person.name}`} onClose={onClose} wide>
      <div className="grid gap-5">
        {type === "student" && (
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-steel-700 bg-steel-850 p-3">
            <StudentPhotoAvatar person={person} size="lg" />
            <div className="min-w-0">
              <p className="text-lg font-bold text-white">{person.name}</p>
              <p className="text-sm text-slate-300">{person.rut || "Sin RUT"} · {person.course || "Sin curso"}</p>
              <p className="mt-1 text-xs text-slate-400">{person.photoFileName ? `Foto asociada desde ${person.photoCourse || "carpeta importada"} · ${person.photoFileName}` : "Sin foto asociada todavía"}</p>
            </div>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Tipo</p><p className="text-xl font-bold text-white">{typeLabel}</p></div>
          <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Préstamos activos</p><p className="text-xl font-bold text-white">{activeLoans.length}</p></div>
          <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Historial préstamos</p><p className="text-xl font-bold text-white">{loans.length}</p></div>
          <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Estado</p><Badge tone={blockReason ? "red" : pendingNotice ? "amber" : "green"}>{blockReason ? "bloqueado" : pendingNotice ? "con pendientes" : "habilitado"}</Badge></div>
        </div>
        {blockReason && <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{blockReason}</div>}
        {!blockReason && pendingNotice && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">{pendingNotice} El servicio sigue habilitado para profesores.</div>}
        {type === "teacher" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-safety-500/35 bg-safety-500/10 p-3">
            <div>
              <p className="font-bold text-white">Recordatorio de devoluciones pendientes</p>
              <p className="text-sm text-slate-400">{pendingReturnLoans.length ? `${pendingReturnLoans.length} prÃ©stamo(s) con elementos pendientes para informar por correo.` : "Este profesor no tiene elementos pendientes de devoluciÃ³n."}</p>
            </div>
            <Button variant="secondary" disabled={!person.email || pendingReturnLoans.length === 0 || sendingPendingEmail} onClick={sendPendingEmail}><FileCheck size={16} />{sendingPendingEmail ? "Enviando..." : "Enviar correo"}</Button>
          </div>
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="grid gap-3">
            <h3 className="section-title"><ClipboardList size={18} />Préstamos</h3>
            <DataTable rows={loans.map((loan) => ({ folio: displayFolio(loan, "PRE"), estado: loan.status, fecha: loan.createdAt, devolucion: loan.expectedReturn, items: loan.items.map((item) => `${item.name} (${item.qty})`).join(", ") }))} columns={[["folio", "Folio"], ["estado", "Estado"], ["fecha", "Entrega"], ["devolucion", "Devolución"], ["items", "Ítems"]]} compact />
          </section>
          <section className="grid gap-3">
            <h3 className="section-title"><Inbox size={18} />Solicitudes y mensajes</h3>
            {type === "teacher" ? (
              <div className="grid gap-3">
                <DataTable rows={requests.map((request) => ({ folio: displayFolio(request, "SOL"), estado: request.status, fecha: request.createdAt, items: request.items.map((item) => `${item.name} (${item.qty})`).join(", ") }))} columns={[["folio", "Folio"], ["estado", "Estado"], ["fecha", "Fecha"], ["items", "Ítems"]]} compact />
                <p className="text-sm text-slate-400">Mensajes registrados: <span className="font-semibold text-white">{messages.length}</span></p>
              </div>
            ) : <p className="rounded-md border border-steel-700 bg-steel-850 p-4 text-sm text-slate-400">Las solicitudes docentes aplican solo a perfiles de profesor.</p>}
          </section>
        </div>
      </div>
    </Modal>
  );
}

function EditEntityModal({ collection, config, initial, onClose, onSave }) {
  const { state } = useApp();
  const [form, setForm] = useState(initial);
  const [codeTouched, setCodeTouched] = useState(Boolean(initial.code));
  const hasCode = config.fields.some(([key]) => key === "code");
  const suggestedCode = hasCode ? generateEntityCode(state, collection, form) : "";
  useEffect(() => {
    if (initial.id || !hasCode || codeTouched) return;
    setForm((current) => ({ ...current, code: generateEntityCode(state, collection, current) }));
  }, [collection, form.category, hasCode, initial.id, codeTouched, state]);
  return (
    <Modal title={initial.id ? "Editar registro" : "Agregar registro"} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        {config.fields.map(([key, label, type]) => key === "status" ? (
          <Field key={key} label={label}><select className={inputClass} value={form[key] || "disponible"} onChange={(e) => setForm({ ...form, [key]: e.target.value })}><option>disponible</option><option>en préstamo</option><option>en reparación</option><option>dañado</option><option>perdido</option><option>dado de baja</option></select></Field>
        ) : key === "code" ? (
          <Field key={key} label={label}>
            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input className={inputClass} value={form[key] || ""} onChange={(e) => { setCodeTouched(true); setForm({ ...form, [key]: e.target.value.toUpperCase() }); }} placeholder={suggestedCode} />
                {!initial.id && <Button variant="secondary" onClick={() => { setCodeTouched(false); setForm({ ...form, code: suggestedCode }); }}><RotateCcw size={16} />Auto</Button>}
              </div>
              {!initial.id && <p className="text-xs text-slate-400">Sugerido automáticamente según categoría: <span className="font-semibold text-white">{suggestedCode}</span></p>}
            </div>
          </Field>
        ) : (
          <Field key={key} label={label}><input className={inputClass} type={type || "text"} value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value })} /></Field>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => onSave(form)}><Save size={16} />Guardar</Button></div>
    </Modal>
  );
}

function Loans({ initialView = "loan", returnFocusLoanId = "" }) {
  const [view, setView] = useState(initialView);
  useEffect(() => setView(initialView), [initialView]);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        {[["loan", PackagePlus, "Préstamo"], ["return", RotateCcw, "Devolución"], ["history", History, "Historial"], ["person", UserRound, "Historial por persona"]].map(([id, Icon, label]) => <Button key={id} variant={view === id ? "primary" : "secondary"} onClick={() => setView(id)}><Icon size={16} />{label}</Button>)}
      </div>
      {view === "loan" && <LoanForm />}
      {view === "return" && <ReturnForm focusLoanId={returnFocusLoanId} />}
      {view === "history" && <MovementHistory />}
      {view === "person" && <PersonHistory />}
    </div>
  );
}

function LoanForm() {
  const { state, dispatch, notify } = useApp();
  const [requesterType, setRequesterType] = useState("student");
  const people = requesterType === "student" ? state.students : state.teachers;
  const availableItems = [...state.materials.map((m) => ({ ...m, type: "material" })), ...state.tools.filter((t) => t.status === "disponible").map((t) => ({ ...t, type: "tool", stock: 1, unit: "un" }))];
  const [requesterQuery, setRequesterQuery] = useState("");
  const [selectedRequester, setSelectedRequester] = useState(null);
  const [batchRequesters, setBatchRequesters] = useState([]);
  const [teacherQuery, setTeacherQuery] = useState("");
  const [selectedResponsibleTeacher, setSelectedResponsibleTeacher] = useState(null);
  const [itemQuery, setItemQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [nonReturnable, setNonReturnable] = useState(false);
  const [qty, setQty] = useState(1);
  const [items, setItems] = useState([]);
  const [expectedReturn, setExpectedReturn] = useState(today());
  const [notes, setNotes] = useState("");
  const [pendingLoan, setPendingLoan] = useState(null);
  const [receipt, setReceipt] = useState(null);
  useEffect(() => {
    setRequesterQuery("");
    setSelectedRequester(null);
    setBatchRequesters([]);
    setTeacherQuery("");
    setSelectedResponsibleTeacher(null);
  }, [requesterType]);
  const filteredPeople = people
    .filter((person) => `${person.name} ${person.rut} ${person.course || ""} ${person.department || ""} ${person.email || ""}`.toLowerCase().includes(requesterQuery.toLowerCase()))
    .slice(0, 8);
  const filteredTeachers = state.teachers
    .filter((teacher) => `${teacher.name} ${teacher.department || ""} ${teacher.email || ""}`.toLowerCase().includes(teacherQuery.toLowerCase()))
    .slice(0, 8);
  const filteredItems = availableItems
    .filter((item) => `${item.name} ${item.code} ${item.category || ""} ${item.description || ""}`.toLowerCase().includes(itemQuery.toLowerCase()))
    .slice(0, 8);
  const chosenRequester = selectedRequester || (requesterQuery ? filteredPeople[0] : null);
  const pendingNotice = chosenRequester ? getPendingLoanNotice(state.loans, requesterType, chosenRequester.id) : "";
  const blockReason = chosenRequester ? getBlockReason(state.loans, requesterType, chosenRequester.id) : "";
  const borrowerCount = requesterType === "student" && batchRequesters.length > 0 ? batchRequesters.length : 1;
  const addBatchRequester = () => {
    if (requesterType !== "student" || !chosenRequester) return;
    if (batchRequesters.some((person) => person.id === chosenRequester.id)) {
      notify("Ese alumno ya esta agregado al lote");
      return;
    }
    const reason = getBlockReason(state.loans, "student", chosenRequester.id);
    if (reason) {
      notify(reason, "error");
      return;
    }
    setBatchRequesters([...batchRequesters, chosenRequester]);
    setRequesterQuery("");
    setSelectedRequester(null);
  };
  const removeBatchRequester = (id) => setBatchRequesters(batchRequesters.filter((person) => person.id !== id));
  const addItem = () => {
    const item = selectedItem || filteredItems[0];
    if (!item) return;
    const doesNotReturn = isFungibleMaterial(item) && nonReturnable;
    setItems([...items, { type: item.type, id: item.id, name: item.name, code: item.code, category: item.category, nonReturnable: doesNotReturn, returnMode: doesNotReturn ? "No retorna" : "Debe volver", qty: item.type === "tool" ? 1 : Number(qty) }]);
    setSelectedItem(null);
    setItemQuery("");
    setNonReturnable(false);
    setQty(1);
  };
  const buildLoanDraft = () => {
    const person = selectedRequester || filteredPeople[0];
    if (!person || items.length === 0) return notify("Selecciona solicitante e ítems", "error");
    const reason = getBlockReason(state.loans, requesterType, person.id);
    if (reason) return notify(reason, "error");
    const teacherNotice = requesterType === "teacher" ? getPendingLoanNotice(state.loans, requesterType, person.id) : "";
    if (teacherNotice) notify(`Profesor con pendientes: ${teacherNotice}`);
    const responsibleTeacher = requesterType === "student" ? (selectedResponsibleTeacher || (teacherQuery ? filteredTeachers[0] : null)) : null;
    return { requesterType, requesterId: person.id, requesterName: person.name, requesterEmail: person.email || "", responsibleTeacherId: responsibleTeacher?.id || "", responsibleTeacherName: responsibleTeacher?.name || "", responsibleTeacherEmail: responsibleTeacher?.email || "", expectedReturn, notes, items: items.map((item) => ({ ...item })), operatorName: state.settings.operatorName };
  };
  const buildBatchLoanDraft = () => {
    const person = selectedRequester || filteredPeople[0];
    const requesters = requesterType === "student" && batchRequesters.length > 0 ? batchRequesters : (person ? [person] : []);
    if (!requesters.length || items.length === 0) return notify("Selecciona solicitante e items", "error");
    const blockedRequester = requesterType === "student" ? requesters.find((item) => getBlockReason(state.loans, "student", item.id)) : null;
    if (blockedRequester) return notify(`${blockedRequester.name}: ${getBlockReason(state.loans, "student", blockedRequester.id)}`, "error");
    const reason = requesterType !== "student" && person ? getBlockReason(state.loans, requesterType, person.id) : "";
    if (reason) return notify(reason, "error");
    const toolInBatch = requesters.length > 1 && items.find((item) => item.type === "tool");
    if (toolInBatch) return notify("Las herramientas unicas deben prestarse de forma individual. El lote esta pensado para materiales repetidos.", "error");
    const stockIssue = items.find((item) => {
      if (item.type !== "material") return false;
      const material = state.materials.find((materialItem) => materialItem.id === item.id);
      return Number(material?.stock || 0) < Number(item.qty || 1) * requesters.length;
    });
    if (stockIssue) return notify(`Stock insuficiente para ${stockIssue.name}. Necesitas ${Number(stockIssue.qty || 1) * requesters.length} unidades para ${requesters.length} solicitud(es).`, "error");
    const teacherNotice = requesterType === "teacher" && person ? getPendingLoanNotice(state.loans, requesterType, person.id) : "";
    if (teacherNotice) notify(`Profesor con pendientes: ${teacherNotice}`);
    const responsibleTeacher = requesterType === "student" ? (selectedResponsibleTeacher || (teacherQuery ? filteredTeachers[0] : null)) : null;
    const primary = requesters[0];
    return { requesterType, requesterId: primary.id, requesterName: primary.name, requesterEmail: primary.email || "", requesters: requesters.map((item) => ({ id: item.id, name: item.name, email: item.email || "", rut: item.rut || "", course: item.course || "" })), responsibleTeacherId: responsibleTeacher?.id || "", responsibleTeacherName: responsibleTeacher?.name || "", responsibleTeacherEmail: responsibleTeacher?.email || "", expectedReturn, notes, items: items.map((item) => ({ ...item })), operatorName: state.settings.operatorName };
  };
  const save = () => {
    const draft = buildBatchLoanDraft();
    if (draft) setPendingLoan(draft);
  };
  const confirmLoan = (draft) => {
    const loanId = uid("pre");
    const loanFolio = nextFolio(state.loans, "PRE");
    const loanForReceipt = { ...draft, id: loanId, folio: loanFolio };
    dispatch({ type: "CREATE_LOAN", loan: loanForReceipt });
    if (draft.responsibleTeacherId) {
      const itemLines = draft.items.map((item) => `- ${item.name} | Codigo: ${item.code || "s/c"} | Cantidad: ${item.qty} | ${item.nonReturnable ? "No retorna" : "Debe volver"}`).join("\n");
      dispatch({
        type: "SEND_MESSAGE",
        message: {
          teacherId: draft.responsibleTeacherId,
          teacherName: draft.responsibleTeacherName,
          loanId,
          from: "pañol",
          to: "docente",
          teacherRead: false,
          adminRead: true,
          body: `Folio prestamo: ${loanFolio}\nPrestamo registrado para alumno: ${draft.requesterName}\nFecha entrega: ${formatDate(today())}\nFecha devolucion esperada: ${formatDate(draft.expectedReturn)}\n\nItems:\n${itemLines}\n\nAl finalizar la clase, por favor enviar al alumno al pañol con los materiales que deben volver.${draft.notes ? `\n\nObservaciones: ${draft.notes}` : ""}`,
          read: false
        }
      });
    }
    setReceipt({ ...loanForReceipt, createdAt: today() });
    notify(draft.responsibleTeacherId ? "Préstamo confirmado y aviso enviado al profesor" : "Préstamo confirmado");
    setPendingLoan(null);
    setItems([]);
    setNotes("");
    setRequesterQuery("");
    setSelectedRequester(null);
    setTeacherQuery("");
    setSelectedResponsibleTeacher(null);
  };
  const confirmBatchLoan = (draft) => {
    const borrowers = draft.requesterType === "student" && draft.requesters?.length ? draft.requesters : [{ id: draft.requesterId, name: draft.requesterName, email: draft.requesterEmail }];
    const folios = nextFolios(state.loans, "PRE", borrowers.length);
    const batchLoanId = borrowers.length > 1 ? uid("lote") : "";
    const createdLoans = borrowers.map((person, index) => ({
      ...draft,
      id: uid("pre"),
      folio: folios[index],
      requesterId: person.id,
      requesterName: person.name,
      requesterEmail: person.email || "",
      batchLoanId,
      batchCount: borrowers.length
    }));
    createdLoans.forEach((loan) => dispatch({ type: "CREATE_LOAN", loan }));
    if (draft.responsibleTeacherId) {
      const itemLines = draft.items.map((item) => `- ${item.name} | Codigo: ${item.code || "s/c"} | Cantidad: ${item.qty} | ${item.nonReturnable ? "No retorna" : "Debe volver"}`).join("\n");
      const borrowerLines = createdLoans.map((loan) => `- ${loan.folio}: ${loan.requesterName}`).join("\n");
      dispatch({
        type: "SEND_MESSAGE",
        message: {
          teacherId: draft.responsibleTeacherId,
          teacherName: draft.responsibleTeacherName,
          loanId: createdLoans[0]?.id,
          from: "panol",
          to: "docente",
          teacherRead: false,
          adminRead: true,
          body: `${createdLoans.length > 1 ? "Prestamos individuales registrados para alumnos:" : "Prestamo registrado para alumno:"}\n${borrowerLines}\nFecha entrega: ${formatDate(today())}\nFecha devolucion esperada: ${formatDate(draft.expectedReturn)}\n\nItems por alumno:\n${itemLines}\n\nAl finalizar la clase, por favor enviar al alumno al panol con los materiales que deben volver.${draft.notes ? `\n\nObservaciones: ${draft.notes}` : ""}`,
          read: false
        }
      });
    }
    setReceipt(createdLoans.map((loan) => ({ ...loan, createdAt: today() })));
    notify(draft.responsibleTeacherId ? `${createdLoans.length} prestamo(s) individual(es) confirmado(s) y aviso enviado al profesor` : `${createdLoans.length} prestamo(s) individual(es) confirmado(s)`);
    setPendingLoan(null);
    setItems([]);
    setNotes("");
    setRequesterQuery("");
    setSelectedRequester(null);
    setBatchRequesters([]);
    setTeacherQuery("");
    setSelectedResponsibleTeacher(null);
  };
  return (
    <div className="panel grid gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Tipo de solicitante"><select className={inputClass} value={requesterType} onChange={(e) => setRequesterType(e.target.value)}><option value="student">Alumno</option><option value="teacher">Profesor</option></select></Field>
        <div className="relative">
          <Field label="Solicitante">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} />
              <input className={`${inputClass} pl-10`} value={requesterQuery} onChange={(e) => { setRequesterQuery(e.target.value); setSelectedRequester(null); }} placeholder="Nombre, RUT, curso o email" />
            </div>
          </Field>
          {requesterQuery && !selectedRequester && (
            <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-md border border-steel-700 bg-steel-900 shadow-xl">
              {filteredPeople.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">Sin resultados</p>}
              {filteredPeople.map((person) => (
                <button key={person.id} type="button" className="flex w-full items-center justify-between gap-3 border-b border-steel-800 px-3 py-3 text-left hover:bg-steel-800" onClick={() => { setSelectedRequester(person); setRequesterQuery(person.name); }}>
                  <span className="flex min-w-0 items-center gap-3">
                    {requesterType === "student" && <StudentPhotoAvatar person={person} size="xs" />}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{person.name}</span>
                      <span className="block truncate text-xs text-slate-400">{person.rut || "Sin RUT"} · {person.course || person.department || "Sin curso/departamento"} · {person.email || "Sin email"}</span>
                    </span>
                  </span>
                  <span className="shrink-0">
                    <Badge tone={requesterType === "student" ? "blue" : "green"}>{requesterType === "student" ? "Alumno" : "Profesor"}</Badge>
                  </span>
                </button>
              ))}
            </div>
          )}
          {selectedRequester && (
            <div className="mt-2 flex items-center gap-3 rounded-md border border-salesian-blue/25 bg-salesian-blue/5 p-2">
              {requesterType === "student" && <StudentPhotoAvatar person={selectedRequester} size="sm" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{selectedRequester.name}</p>
                <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                  {selectedRequester.rut || "Sin RUT"} · {selectedRequester.course || selectedRequester.department || "Sin curso/departamento"} · {selectedRequester.email || "Sin email"}
                </p>
              </div>
            </div>
          )}
        </div>
        {requesterType === "student" && (
          <div className="flex items-end">
            <Button variant="secondary" disabled={!chosenRequester} onClick={addBatchRequester}>
              <Plus size={16} />Agregar alumno
            </Button>
          </div>
        )}
        <Field label="Fecha esperada"><input className={inputClass} type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} /></Field>
        <Field label="Observaciones"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Uso, taller o módulo" /></Field>
      </div>
      {requesterType === "student" && batchRequesters.length > 0 && (
        <div className="rounded-lg border border-salesian-blue/25 bg-salesian-blue/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-950 dark:text-white">Prestamo multiple de alumnos</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">Se creara un folio individual para cada alumno con los mismos items y cantidades.</p>
            </div>
            <Badge tone="blue">{borrowerCount} solicitud(es)</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {batchRequesters.map((person) => (
              <span key={person.id} className="inline-flex items-center gap-2 rounded-full border border-salesian-blue/30 bg-white px-3 py-1 text-sm font-semibold text-salesian-blue shadow-sm dark:bg-steel-850 dark:text-white">
                {person.name}
                <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => removeBatchRequester(person.id)} title="Quitar alumno"><X size={14} /></button>
              </span>
            ))}
          </div>
        </div>
      )}
      {requesterType === "student" && (
        <div className="relative max-w-3xl rounded-lg border border-sky-500/30 bg-sky-500/10 p-4">
          <Field label="Profesor responsable de la clase (opcional)">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} />
              <input className={`${inputClass} pl-10`} value={teacherQuery} onChange={(e) => { setTeacherQuery(e.target.value); setSelectedResponsibleTeacher(null); }} placeholder="Buscar profesor por nombre, departamento o email" />
            </div>
          </Field>
          {(selectedResponsibleTeacher || (teacherQuery && filteredTeachers[0])) && <p className="mt-2 text-sm text-slate-300">Se avisara por chat a <strong>{(selectedResponsibleTeacher || filteredTeachers[0]).name}</strong> cuando registres el prestamo.</p>}
          {teacherQuery && !selectedResponsibleTeacher && (
            <div className="absolute z-30 mt-2 max-h-72 w-[calc(100%-2rem)] overflow-auto rounded-md border border-steel-700 bg-steel-900 shadow-xl">
              {filteredTeachers.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">Sin profesores encontrados</p>}
              {filteredTeachers.map((teacher) => (
                <button key={teacher.id} type="button" className="flex w-full items-center justify-between gap-3 border-b border-steel-800 px-3 py-3 text-left hover:bg-steel-800" onClick={() => { setSelectedResponsibleTeacher(teacher); setTeacherQuery(teacher.name); }}>
                  <span>
                    <span className="block text-sm font-semibold text-white">{teacher.name}</span>
                    <span className="block text-xs text-slate-400">{teacher.department || "Sin departamento"} · {teacher.email || "Sin email"}</span>
                  </span>
                  <Badge tone="green">Profesor</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {blockReason && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200"><AlertTriangle className="mr-2 inline" size={16} />{blockReason}</div>}
      {!blockReason && requesterType === "teacher" && pendingNotice && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200"><AlertTriangle className="mr-2 inline" size={16} />Profesor con pendientes: {pendingNotice} Puedes registrar el prestamo si corresponde.</div>}
      <div className="grid gap-3 rounded-lg border border-steel-700 bg-steel-850 p-4 md:grid-cols-[1fr_120px_auto]">
        <div className="relative">
          <Field label="Buscar y agregar ítem">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} />
              <input className={`${inputClass} pl-10`} value={itemQuery} onChange={(e) => { setItemQuery(e.target.value); setSelectedItem(null); }} placeholder="Nombre, código o categoría" />
            </div>
          </Field>
          {itemQuery && !selectedItem && (
            <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-md border border-steel-700 bg-steel-900 shadow-xl">
              {filteredItems.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">Sin resultados</p>}
              {filteredItems.map((item) => (
                <button key={item.id} type="button" className="flex w-full items-center justify-between gap-3 border-b border-steel-800 px-3 py-3 text-left hover:bg-steel-800" onClick={() => { setSelectedItem(item); setItemQuery(`${item.code} · ${item.name}`); }}>
                  <span>
                    <span className="block text-sm font-semibold text-white">{item.name}</span>
                    <span className="block text-xs text-slate-400">{item.code} · {item.type === "material" ? `${item.category || "Material"} · stock ${item.stock}` : `Herramienta · ${item.status}`}</span>
                  </span>
                  <Badge tone={item.type === "material" ? "blue" : "amber"}>{item.type === "material" ? "Material" : "Herramienta"}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
        <Field label="Cantidad"><input className={inputClass} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <div className="flex items-end"><Button disabled={!selectedItem && filteredItems.length === 0} onClick={addItem}><Plus size={16} />Agregar</Button></div>
      </div>
      {isFungibleMaterial(selectedItem) && (
        <label className="inline-flex max-w-xl items-center gap-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200">
          <input type="checkbox" checked={nonReturnable} onChange={(e) => setNonReturnable(e.target.checked)} />
          No vuelve al inventario. Se descuenta del stock y no queda pendiente de devolución.
        </label>
      )}
      <DataTable rows={items} columns={[["name", "Ítem"], ["code", "Código"], ["type", "Tipo"], ["qty", "Cantidad"], ["returnMode", "Retorno"]]} actions={(row) => <Button variant="ghost" className="px-2 text-red-300" onClick={() => setItems(items.filter((i) => i !== row))}><X size={16} /></Button>} compact />
      <div className="flex justify-end"><Button disabled={Boolean(blockReason)} onClick={save}><ShieldCheck size={16} />Registrar préstamo</Button></div>
      {pendingLoan && <LoanReviewModal loan={pendingLoan} onClose={() => setPendingLoan(null)} onConfirm={confirmBatchLoan} />}
      {Array.isArray(receipt) && receipt.length > 0 && <ReceiptModal loan={receipt[0]} onClose={() => setReceipt(receipt.slice(1))} />}
      {receipt && !Array.isArray(receipt) && <ReceiptModal loan={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function LoanReviewModal({ loan, onClose, onConfirm }) {
  const [draft, setDraft] = useState(loan);
  const updateItem = (index, patch) => {
    setDraft({
      ...draft,
      items: draft.items.map((item, itemIndex) => (
        itemIndex === index
          ? { ...item, ...patch, returnMode: patch.nonReturnable === undefined ? item.returnMode : (patch.nonReturnable ? "No retorna" : "Debe volver") }
          : item
      ))
    });
  };
  const removeItem = (index) => {
    setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) });
  };
  const confirm = () => {
    const cleanItems = draft.items
      .map((item) => ({
        ...item,
        name: String(item.name || "").trim(),
        code: String(item.code || "").trim(),
        qty: Math.max(1, Number(item.qty) || 1),
        returnMode: item.nonReturnable ? "No retorna" : "Debe volver"
      }))
      .filter((item) => item.name);
    if (!cleanItems.length) return;
    onConfirm({ ...draft, items: cleanItems });
  };
  return (
    <Modal title="Revisar y confirmar préstamo" onClose={onClose} wide>
      <div className="grid gap-4">
        <div className="rounded-md border border-safety-500/40 bg-safety-500/10 px-4 py-3 text-sm text-slate-100">
          Revisa y corrige estos datos antes de generar el préstamo. El stock y el historial se actualizan recién al confirmar.
        </div>
        {draft.requesters?.length > 1 && (
          <div className="rounded-md border border-salesian-blue/30 bg-salesian-blue/5 p-4">
            <p className="mb-2 text-sm font-bold text-slate-950 dark:text-white">Se generaran {draft.requesters.length} comprobantes individuales</p>
            <div className="flex flex-wrap gap-2">
              {draft.requesters.map((person) => (
                <span key={person.id} className="rounded-full border border-salesian-blue/25 bg-white px-3 py-1 text-xs font-semibold text-salesian-blue dark:bg-steel-850 dark:text-white">{person.name}</span>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Solicitante"><input className={inputClass} value={draft.requesterName} onChange={(event) => setDraft({ ...draft, requesterName: event.target.value })} /></Field>
          <Field label="Email solicitante"><input className={inputClass} value={draft.requesterEmail || ""} onChange={(event) => setDraft({ ...draft, requesterEmail: event.target.value })} /></Field>
          <Field label="Fecha devolución"><input className={inputClass} type="date" value={draft.expectedReturn} onChange={(event) => setDraft({ ...draft, expectedReturn: event.target.value })} /></Field>
          <Field label="Responsable entrega"><input className={inputClass} value={draft.operatorName || ""} onChange={(event) => setDraft({ ...draft, operatorName: event.target.value })} /></Field>
          {draft.responsibleTeacherName && <Field label="Profesor responsable"><input className={inputClass} value={draft.responsibleTeacherName} onChange={(event) => setDraft({ ...draft, responsibleTeacherName: event.target.value })} /></Field>}
          <Field label="Observaciones"><input className={inputClass} value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Uso, taller o módulo" /></Field>
        </div>
        <div className="overflow-x-auto rounded-md border border-steel-700">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-steel-800 text-left text-xs uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-3 py-3">Ítem</th>
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">Cantidad</th>
                <th className="px-3 py-3">Retorno</th>
                <th className="px-3 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-700">
              {draft.items.map((item, index) => (
                <tr key={`${item.id}-${index}`} className="bg-steel-900/60">
                  <td className="px-3 py-2"><input className={inputClass} value={item.name} onChange={(event) => updateItem(index, { name: event.target.value })} /></td>
                  <td className="px-3 py-2"><input className={inputClass} value={item.code || ""} onChange={(event) => updateItem(index, { code: event.target.value })} /></td>
                  <td className="px-3 py-2"><input className={inputClass} type="number" min="1" value={item.qty} onChange={(event) => updateItem(index, { qty: Number(event.target.value) || 1 })} /></td>
                  <td className="px-3 py-2">
                    <select className={inputClass} value={item.nonReturnable ? "no" : "yes"} onChange={(event) => updateItem(index, { nonReturnable: event.target.value === "no" })}>
                      <option value="yes">Debe volver</option>
                      <option value="no">No retorna</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right"><Button variant="ghost" className="px-2 text-red-300" onClick={() => removeItem(index)}><Trash2 size={16} /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Volver a editar</Button>
          <Button onClick={confirm}><ShieldCheck size={16} />Confirmar y generar préstamo</Button>
        </div>
      </div>
    </Modal>
  );
}

function ReturnForm({ focusLoanId = "" }) {
  const { state, dispatch, notify } = useApp();
  const active = state.loans.filter((l) => l.status === "activo");
  const [query, setQuery] = useState("");
  const [loanId, setLoanId] = useState(active[0]?.id || "");
  const filtered = active.filter((loan) => `${loan.requesterName} ${loan.items.map((item) => `${item.name} ${item.code}`).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const loan = active.find((l) => l.id === loanId);
  const returnableItems = loan?.items.filter((item) => !item.nonReturnable) || [];
  const [partial, setPartial] = useState(false);
  const [conditions, setConditions] = useState({});
  useEffect(() => {
    if (focusLoanId && active.some((item) => item.id === focusLoanId)) {
      setLoanId(focusLoanId);
      return;
    }
    setLoanId(active[0]?.id || "");
  }, [focusLoanId, state.loans.length]);
  const submit = () => {
    if (!loan) return;
    dispatch({ type: "RETURN_LOAN", loanId, partial, operatorName: state.settings.operatorName, notes: "Registrado desde formulario", items: returnableItems.map((item) => ({ ...item, condition: conditions[item.id] || "disponible" })) });
    notify(partial ? "Devolución parcial registrada" : "Devolución total registrada");
  };
  return (
    <div className="panel grid gap-5">
      <div className="grid gap-4 md:grid-cols-[180px_1fr_220px]">
        <div className="rounded-md border border-steel-700 bg-steel-850 p-3">
          <p className="text-sm text-slate-400">Solicitudes activas</p>
          <p className="text-3xl font-bold text-white">{active.length}</p>
        </div>
        <Field label="Buscar solicitud">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} />
            <input className={`${inputClass} pl-10`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, material o código" />
          </div>
        </Field>
        <Field label="Tipo de devolución"><select className={inputClass} value={partial ? "parcial" : "total"} onChange={(e) => setPartial(e.target.value === "parcial")}><option value="total">Total</option><option value="parcial">Parcial</option></select></Field>
      </div>
      <div className="grid gap-2">
        {filtered.length === 0 && <div className="rounded-md border border-steel-700 bg-steel-850 p-4 text-center text-sm text-slate-400">No hay solicitudes activas para esa búsqueda</div>}
        {filtered.map((item) => {
          const expanded = loanId === item.id;
          const itemReturnables = item.items.filter((loanItem) => !loanItem.nonReturnable);
          return (
            <div key={item.id} className={`overflow-hidden rounded-md border transition ${expanded ? "border-safety-500 bg-safety-500/10 shadow-md" : "border-steel-700 bg-steel-850 hover:bg-steel-800"}`}>
              <button type="button" onClick={() => setLoanId(item.id)} className="w-full p-3 text-left">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-white"><span className="text-safety-500">{displayFolio(item, "PRE")}</span> · {item.requesterName}</p>
                    <p className="text-sm text-slate-400">{item.items.map((loanItem) => `${loanItem.name} (${loanItem.qty}${loanItem.nonReturnable ? ", no retorna" : ""})`).join(", ")}</p>
                  </div>
                  <Badge tone={isOverdue(item) ? "red" : "amber"}>{isOverdue(item) ? `${overdueDays(item.expectedReturn)} días atraso` : `vence ${formatDate(item.expectedReturn)}`}</Badge>
                </div>
              </button>
              {expanded && (
                <div className="border-t border-safety-500/40 bg-white/60 p-3 dark:bg-steel-950/35">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Ítems a devolver de esta solicitud</p>
                    <Badge tone={partial ? "amber" : "green"}>{partial ? "Devolución parcial" : "Devolución total"}</Badge>
                  </div>
                  <div className="grid gap-3">
                    {itemReturnables.length === 0 && <div className="rounded-md border border-steel-700 bg-steel-850 p-3 text-sm text-slate-400">Esta solicitud no tiene ítems retornables.</div>}
                    {itemReturnables.map((loanItem) => (
                      <div key={`${item.id}-${loanItem.type}-${loanItem.id}`} className="grid gap-3 rounded-md border border-slate-300 bg-white p-3 md:grid-cols-[1fr_180px] dark:border-steel-700 dark:bg-steel-850">
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">{loanItem.name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{loanItem.code} · cantidad {loanItem.qty}</p>
                        </div>
                        <select className={inputClass} value={conditions[loanItem.id] || "disponible"} onChange={(e) => setConditions({ ...conditions, [loanItem.id]: e.target.value })}>
                          <option value="disponible">Buen estado</option>
                          <option value="reparación">Requiere reparación</option>
                          <option value="dañado">Dañado</option>
                          <option value="perdido">Perdido</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button disabled={!itemReturnables.length} onClick={submit}><RotateCcw size={16} />Registrar devolución de esta solicitud</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReceiptModal({ loan, onClose }) {
  const { notify } = useApp();
  const [sendingEmail, setSendingEmail] = useState(false);
  const sendReceiptEmail = async () => {
    if (!loan.requesterEmail) return notify("El solicitante no tiene correo registrado", "error");
    setSendingEmail(true);
    try {
      const result = await sendEmailWithFallback(buildReceiptEmailPayload(loan));
      notify(result.mode === "mailto" ? "Resend esta limitado. Se abrio Outlook con el comprobante listo para enviar." : "Comprobante enviado por correo");
    } catch (error) {
      notify(`No se pudo enviar el comprobante: ${error.message || error}`, "error");
    } finally {
      setSendingEmail(false);
    }
  };
  return (
    <Modal title="Comprobante de préstamo" onClose={onClose}>
      <div className="grid gap-4">
        <div className="rounded-md border border-steel-700 bg-steel-850 p-4 print:border-slate-300">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">PAÑOL CENTRAL COLEGIO SALESIANO</h2>
              <p className="text-sm text-slate-400">Comprobante de entrega de materiales/herramientas</p>
            </div>
            <Badge tone="amber">Préstamo</Badge>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <p><strong>Folio prestamo:</strong> {displayFolio(loan, "PRE")}</p>
            {loan.requestFolio && <p><strong>Solicitud origen:</strong> {loan.requestFolio}</p>}
            <p><strong>Solicitante:</strong> {loan.requesterName}</p>
            <p><strong>Tipo:</strong> {loan.requesterType === "student" ? "Alumno" : "Profesor"}</p>
            <p><strong>Fecha entrega:</strong> {formatDate(loan.createdAt)}</p>
            <p><strong>Fecha devolución:</strong> {formatDate(loan.expectedReturn)}</p>
            {loan.responsibleTeacherName && <p><strong>Profesor responsable:</strong> {loan.responsibleTeacherName}</p>}
            <p><strong>Responsable entrega:</strong> {loan.operatorName}</p>
            <p><strong>Observaciones:</strong> {loan.notes || "Sin observaciones"}</p>
          </div>
          <div className="mt-4">
            <DataTable rows={loan.items.map((item) => ({ ...item, returnMode: item.nonReturnable ? "No retorna" : "Debe volver" }))} columns={[["name", "Ítem"], ["code", "Código"], ["type", "Tipo"], ["qty", "Cantidad"], ["returnMode", "Retorno"]]} compact />
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="border-t border-steel-700 pt-2 text-center text-sm">Firma solicitante</div>
            <div className="border-t border-steel-700 pt-2 text-center text-sm">Firma responsable pañol</div>
          </div>
        </div>
        <div className="flex justify-end gap-2 print:hidden">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button variant="secondary" disabled={!loan.requesterEmail || sendingEmail} onClick={sendReceiptEmail}><FileCheck size={16} />{sendingEmail ? "Enviando..." : "Enviar por correo"}</Button>
          <Button onClick={() => window.print()}><Printer size={16} />Imprimir</Button>
        </div>
      </div>
    </Modal>
  );
}

function buildReceiptEmailPayload(loan) {
  const subject = `Comprobante de préstamo - Pañol Central`;
  const itemsRows = loan.items.map((item) => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #d7dfed;font-weight:700;color:#0f172a;">${emailHtmlEscape(item.name)}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #d7dfed;text-align:center;color:#0f172a;">${emailHtmlEscape(item.qty)}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #d7dfed;color:${item.nonReturnable ? "#b45309" : "#166534"};font-weight:700;">${item.nonReturnable ? "No retorna" : "Debe ser devuelto"}</td>
    </tr>
  `).join("");
  const html = `
    <div style="margin:0;padding:24px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d7dfed;border-radius:14px;overflow:hidden;">
        <div style="background:#172554;color:#ffffff;padding:24px 28px;border-bottom:5px solid #facc15;">
          <div style="font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:#fde68a;font-weight:700;">Pañol Central Colegio Salesiano</div>
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">Comprobante de préstamo</h1>
          <p style="margin:8px 0 0;color:#dbeafe;">Folio ${emailHtmlEscape(displayFolio(loan, "PRE"))}</p>
        </div>

        <div style="padding:24px 28px;">
          <p style="margin:0 0 18px;font-size:16px;">Estimado/a <strong>${emailHtmlEscape(loan.requesterName)}</strong>, se registra la entrega de los siguientes materiales/herramientas:</p>

          <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px;background:#f8fafc;border:1px solid #d7dfed;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:12px 14px;width:50%;border-bottom:1px solid #d7dfed;"><strong>Fecha entrega</strong><br>${emailHtmlEscape(formatDate(loan.createdAt))}</td>
              <td style="padding:12px 14px;border-bottom:1px solid #d7dfed;"><strong>Fecha devolución esperada</strong><br>${emailHtmlEscape(formatDate(loan.expectedReturn))}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;"><strong>Responsable entrega</strong><br>${emailHtmlEscape(loan.operatorName || "Encargado de pañol")}</td>
              <td style="padding:12px 14px;"><strong>Observaciones</strong><br>${emailHtmlEscape(loan.notes || "Sin observaciones")}</td>
            </tr>
          </table>

          <h2 style="font-size:18px;margin:0 0 10px;">Detalle de elementos</h2>
          <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #d7dfed;border-radius:10px;overflow:hidden;">
            <thead>
              <tr style="background:#e8eef8;color:#172554;text-transform:uppercase;font-size:12px;letter-spacing:.5px;">
                <th align="left" style="padding:12px 14px;">Elemento</th>
                <th align="center" style="padding:12px 14px;">Cantidad</th>
                <th align="left" style="padding:12px 14px;">Compromiso</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>

          ${loan.responsibleTeacherName ? `<p style="margin:18px 0 0;color:#334155;"><strong>Profesor responsable:</strong> ${emailHtmlEscape(loan.responsibleTeacherName)}</p>` : ""}
          ${loan.requestFolio ? `<p style="margin:8px 0 0;color:#334155;"><strong>Solicitud origen:</strong> ${emailHtmlEscape(loan.requestFolio)}</p>` : ""}

          <div style="margin-top:22px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#78350f;">
            Por favor, devolver los elementos marcados como <strong>Debe ser devuelto</strong> en la fecha indicada.
          </div>
        </div>

        <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #d7dfed;color:#64748b;font-size:13px;">
          Este comprobante fue generado automáticamente por el sistema de Pañol Central.
        </div>
      </div>
    </div>
  `;
  const body = [
    "PAÑOL CENTRAL COLEGIO SALESIANO",
    "",
    "Comprobante de préstamo",
    `Folio prestamo: ${displayFolio(loan, "PRE")}`,
    ...(loan.requestFolio ? [`Solicitud origen: ${loan.requestFolio}`] : []),
    `Solicitante: ${loan.requesterName}`,
    `Fecha entrega: ${formatDate(loan.createdAt)}`,
    `Fecha devolución esperada: ${formatDate(loan.expectedReturn)}`,
    ...(loan.responsibleTeacherName ? [`Profesor responsable: ${loan.responsibleTeacherName}`] : []),
    `Responsable entrega: ${loan.operatorName}`,
    "",
    "Ítems entregados:",
    ...loan.items.map((item) => `- ${item.name} | Cantidad: ${item.qty} | ${item.nonReturnable ? "No retorna al inventario" : "Debe ser devuelto"}`),
    "",
    `Observaciones: ${loan.notes || "Sin observaciones"}`,
    "",
    "Este comprobante fue generado por el sistema de Pañol Central."
  ].join("\n");
  return {
    to: loan.requesterEmail || "",
    subject,
    text: body,
    html
  };
}

function emailHtmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPendingReturnsMailto(teacher, pendingLoans = []) {
  const payload = buildPendingReturnsEmailPayload(teacher, pendingLoans);
  return buildMailtoFromPayload(payload);
}

function buildPendingReturnsEmailPayload(teacher, pendingLoans = []) {
  const totalItems = pendingLoans.reduce((total, loan) => total + loan.returnableItems.reduce((sum, item) => sum + Number(item.qty || 1), 0), 0);
  return {
    to: teacher?.email || "",
    subject: "Recordatorio de materiales pendientes - Pañol Central",
    text: [
    `Estimado/a ${teacher?.name || "docente"},`,
    "",
    "Junto con saludar, recordamos bajar a pañol lo antes posible los siguientes materiales/herramientas que se encuentran pendientes de devolución:",
    "",
    ...pendingLoans.flatMap((loan) => [
      `${loan.folioText || displayFolio(loan, "PRE")} - solicitado/entregado el ${formatDate(loan.createdAt)} - fecha de devolución esperada: ${formatDate(loan.expectedReturn)}${isOverdue(loan) ? ` (${overdueDays(loan.expectedReturn)} día(s) de atraso)` : ""}`,
      ...loan.returnableItems.map((item) => `  - ${item.name} | Código: ${item.code || "s/c"} | Cantidad: ${item.qty}`),
      ""
    ]),
    `Total pendiente: ${totalItems} elemento(s) asociado(s) a ${pendingLoans.length} préstamo(s).`,
    "",
    "Por favor, regularizar la devolución en Pañol Central a la brevedad.",
    "",
    "Saludos cordiales,",
    "PAÑOL CENTRAL COLEGIO SALESIANO"
    ].join("\n")
  };
}

async function sendEmailViaSupabase(payload) {
  if (!supabase) throw new Error("Supabase no está configurado para enviar correos.");
  const { data, error } = await supabase.functions.invoke("send-email", { body: payload });
  if (error) throw new Error(error.message || "No se pudo llamar a la función de correo.");
  if (!data?.ok) throw new Error(data?.detail?.message || data?.detail || data?.error || "No se pudo enviar el correo.");
  return data;
}

function buildMailtoFromPayload(payload) {
  const to = Array.isArray(payload?.to) ? payload.to.join(",") : payload?.to || "";
  const subject = payload?.subject || "Correo Panol Central";
  const body = payload?.text || "";
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function sendEmailWithFallback(payload) {
  try {
    await sendEmailViaSupabase(payload);
    return { mode: "resend" };
  } catch (error) {
    if (!payload?.to || typeof window === "undefined") throw error;
    window.location.href = buildMailtoFromPayload(payload);
    return { mode: "mailto", error };
  }
}

function MovementHistory() {
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
  const rows = state.movements.filter((m) => (status === "todos" || m.status === status) && JSON.stringify(m).toLowerCase().includes(query.toLowerCase()));
  return <div className="panel"><Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} /><DataTable rows={rows} columns={[["date", "Fecha"], ["type", "Tipo"], ["detail", "Detalle"], ["requesterName", "Solicitante"], ["status", "Estado"]]} /></div>;
}

function PersonHistory() {
  const { state } = useApp();
  const people = [
    ...state.students.map((person) => ({ ...person, requesterType: "student", role: "Alumno", group: person.course })),
    ...state.teachers.map((person) => ({ ...person, requesterType: "teacher", role: "Profesor", group: person.department }))
  ];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [credential, setCredential] = useState(null);
  const filtered = people
    .filter((person) => `${person.name} ${person.rut || ""} ${person.group || ""} ${person.email || ""}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10);
  const personLoans = selected
    ? state.loans.filter((loan) => personKey(loan.requesterType, loan.requesterId) === personKey(selected.requesterType, selected.id))
    : [];
  const rows = personLoans.map((loan) => ({
    ...loan,
    folioText: displayFolio(loan, "PRE"),
    statusText: loan.partialReturn ? "parcial pendiente" : isOverdue(loan) ? "vencido" : loan.status,
    itemsText: loan.items.map((item) => `${item.name} (${item.qty}${item.nonReturnable ? ", no retorna" : ""})`).join(", "),
    days: isOverdue(loan) ? overdueDays(loan.expectedReturn) : 0
  }));
  const blockReason = selected ? getBlockReason(state.loans, selected.requesterType, selected.id) : "";
  return (
    <div className="panel grid gap-5">
      <div className="relative max-w-2xl">
        <Field label="Buscar persona">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} />
            <input className={`${inputClass} pl-10`} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Nombre, apellido, RUT, curso, departamento o email" />
          </div>
        </Field>
{query && !selected && (
  <div className="mt-2 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
    {filtered.length === 0 && (
      <p className="px-3 py-3 text-sm text-slate-500">
        Sin resultados
      </p>
    )}

    {filtered.map((person) => (
      <button
        key={`${person.requesterType}-${person.id}`}
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-lg border-b border-slate-100 px-3 py-3 text-left text-slate-800 transition hover:bg-yellow-50"
        onClick={() => {
          setSelected(person);
          setQuery(person.name);
        }}
      >
        <span>
          <span className="block text-sm font-semibold text-slate-950">
            {person.name}
          </span>

          <span className="block text-xs text-slate-500">
            {person.role} · {person.group || "Sin grupo"} · {person.email || "Sin email"}
          </span>
        </span>

        <Badge tone={getBlockReason(state.loans, person.requesterType, person.id) ? "red" : "green"}>
          {getBlockReason(state.loans, person.requesterType, person.id) ? "Bloqueado" : "Habilitado"}
        </Badge>
      </button>
    ))}
  </div>
)}
      </div>

      {selected && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Persona</p><p className="font-bold">{selected.name}</p></div>
            <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Estado</p><Badge tone={blockReason ? "red" : "green"}>{blockReason ? "Bloqueado" : "Habilitado"}</Badge></div>
            <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Préstamos</p><p className="font-bold">{personLoans.length}</p></div>
            <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Pendientes</p><p className="font-bold">{personLoans.filter((loan) => loan.status === "activo").length}</p></div>
          </div>
          <div className="flex justify-end"><Button variant="secondary" onClick={() => setCredential(selected)}><QrCode size={16} />Ver credencial QR</Button></div>
          {blockReason && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200"><AlertTriangle className="mr-2 inline" size={16} />{blockReason}</div>}
          <DataTable rows={rows} columns={[["folioText", "Folio"], ["createdAt", "Fecha"], ["expectedReturn", "Fecha esperada"], ["statusText", "Estado"], ["days", "Días atraso"], ["itemsText", "Ítems"], ["notes", "Observaciones"]]} />
          {credential && <CredentialModal person={credential} blockReason={blockReason} onClose={() => setCredential(null)} />}
        </>
      )}
    </div>
  );
}

function CredentialModal({ person, blockReason, onClose }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    QRCode.toDataURL(JSON.stringify({ id: person.id, type: person.requesterType, name: person.name, group: person.group || "", email: person.email || "" }), { margin: 1, width: 180 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [person]);
  return (
    <Modal title="Credencial de solicitante" onClose={onClose}>
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="grid place-items-center rounded-md border border-steel-700 bg-white p-4">{qr ? <img src={qr} alt="QR de credencial" /> : <QrCode size={120} className="text-slate-500" />}</div>
        <div className="grid content-start gap-3">
          <h2 className="text-2xl font-bold text-white">{person.name}</h2>
          <p className="text-slate-300">{person.role} · {person.group || "Sin grupo"}</p>
          <p className="text-slate-400">{person.email || "Sin email"}</p>
          <Badge tone={blockReason ? "red" : "green"}>{blockReason ? "Bloqueado" : "Habilitado"}</Badge>
          {blockReason && <p className="text-sm text-red-300">{blockReason}</p>}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cerrar</Button><Button onClick={() => window.print()}><Printer size={16} />Imprimir</Button></div>
    </Modal>
  );
}

function TeacherPortal() {
  const { state, dispatch, notify } = useApp();
  const [sessionId, setSessionId] = useState(() => sessionStorage.getItem(PORTAL_SESSION_KEY) || "");
  const user = (state.portalUsers || []).find((portalUser) => portalUser.id === sessionId && portalUser.active);
  const teacher = user ? state.teachers.find((person) => person.id === user.teacherId) : null;
  const [itemQuery, setItemQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [qty, setQty] = useState(1);
  const [items, setItems] = useState([]);
  const [expectedDate, setExpectedDate] = useState(today());
  const [notes, setNotes] = useState("");
  const availableItems = [...state.materials.map((m) => ({ ...m, type: "material" })), ...state.tools.filter((t) => t.status === "disponible").map((t) => ({ ...t, type: "tool", stock: 1, unit: "un" }))];
  const filteredItems = availableItems.filter((item) => `${item.name} ${item.code} ${item.category || ""}`.toLowerCase().includes(itemQuery.toLowerCase())).slice(0, 8);
  const myRequests = teacher ? (state.requests || []).filter((request) => request.requesterId === teacher.id) : [];
  const myLoans = teacher ? state.loans.filter((loan) => loan.requesterType === "teacher" && loan.requesterId === teacher.id) : [];

  if (!teacher) return <PortalLogin onLogin={(id) => { sessionStorage.setItem(PORTAL_SESSION_KEY, id); setSessionId(id); }} />;

  const addItem = () => {
    const item = selectedItem || filteredItems[0];
    if (!item) return;
    setItems([...items, { type: item.type, id: item.id, name: item.name, code: item.code, category: item.category, qty: item.type === "tool" ? 1 : Number(qty), nonReturnable: false }]);
    setSelectedItem(null);
    setItemQuery("");
    setQty(1);
  };
  const submit = () => {
    if (!teacher || !items.length) return notify("Agrega ítems a la solicitud", "error");
    dispatch({ type: "CREATE_REQUEST", request: { requesterType: "teacher", requesterId: teacher.id, requesterName: teacher.name, requesterEmail: teacher.email || "", department: teacher.department || "", expectedDate, notes, items } });
    notify("Solicitud enviada al pañol");
    setItems([]);
    setNotes("");
    setItemQuery("");
  };
  const logout = () => {
    clearAuthStorage();
    setSessionId("");
    window.location.replace(window.location.pathname);
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
      <div className="panel grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="section-title"><UserCog size={18} />Portal docente</h2>
            <p className="font-bold text-white">{teacher.name}</p>
            <p className="text-sm text-slate-400">{teacher.department || "Sin departamento"} · {teacher.email || "Sin email"}</p>
          </div>
          <Button variant="secondary" onClick={logout}><LogOut size={16} />Salir</Button>
        </div>
        <Field label="Fecha solicitada"><input className={inputClass} type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></Field>
        <Field label="Observaciones"><textarea className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Curso, asignatura, actividad o motivo" /></Field>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Solicitudes</p><p className="text-2xl font-bold">{myRequests.length}</p></div>
          <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Pendientes</p><p className="text-2xl font-bold">{myRequests.filter((request) => request.status === "pendiente").length}</p></div>
          <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Préstamos</p><p className="text-2xl font-bold">{myLoans.length}</p></div>
        </div>
      </div>
      <div className="panel grid gap-4">
        <h2 className="section-title"><PackagePlus size={18} />Ítems solicitados</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_120px_auto]">
          <div className="relative">
            <Field label="Buscar material o herramienta"><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} /><input className={`${inputClass} pl-10`} value={itemQuery} onChange={(e) => { setItemQuery(e.target.value); setSelectedItem(null); }} placeholder="Nombre, código o categoría" /></div></Field>
            {itemQuery && !selectedItem && <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-md border border-steel-700 bg-steel-900 shadow-xl">{filteredItems.map((item) => <button key={item.id} className="flex w-full justify-between gap-3 border-b border-steel-800 px-3 py-3 text-left hover:bg-steel-800" onClick={() => { setSelectedItem(item); setItemQuery(`${item.code} · ${item.name}`); }}><span><span className="block font-semibold text-white">{item.name}</span><span className="text-xs text-slate-400">{item.code} · {item.type === "material" ? `stock ${item.stock}` : item.status}</span></span><Badge tone={item.type === "material" ? "blue" : "amber"}>{item.type === "material" ? "Material" : "Herramienta"}</Badge></button>)}</div>}
          </div>
          <Field label="Cantidad"><input className={inputClass} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <div className="flex items-end"><Button onClick={addItem} disabled={!selectedItem && !filteredItems.length}><Plus size={16} />Agregar</Button></div>
        </div>
        <DataTable rows={items} columns={[["name", "Ítem"], ["code", "Código"], ["type", "Tipo"], ["qty", "Cantidad"]]} actions={(row) => <Button variant="ghost" className="px-2 text-red-300" onClick={() => setItems(items.filter((item) => item !== row))}><X size={16} /></Button>} compact />
        <div className="flex justify-end"><Button onClick={submit}><FileCheck size={16} />Enviar solicitud</Button></div>
      </div>
      <div className="panel xl:col-span-2">
        <h2 className="section-title"><History size={18} />Mis solicitudes y préstamos</h2>
        <DataTable rows={myRequests.map((request) => ({ ...request, folioText: displayFolio(request, "SOL"), itemsText: request.items.map((item) => `${item.name} (${item.qty}${item.prepStatus ? `, ${item.prepStatus}` : ""})`).join(", ") }))} columns={[["folioText", "Folio"], ["createdAt", "Fecha"], ["expectedDate", "Fecha solicitada"], ["status", "Estado"], ["itemsText", "Ítems"], ["notes", "Observaciones"]]} compact />
      </div>
    </div>
  );
}

function PortalLogin({ onLogin }) {
  const { state, dispatch, notify } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pendingUser, setPendingUser] = useState(null);
  const login = () => {
    const user = (state.portalUsers || []).find((portalUser) => portalUser.active && normalizeHeader(portalUser.username) === normalizeHeader(username));
    if (!user || user.password !== password) return notify("Usuario o clave incorrecta", "error");
    if (user.mustChangePassword) {
      setPendingUser(user);
      return;
    }
    onLogin(user.id);
  };
  const changePassword = () => {
    if (!newPassword || newPassword.length < 4) return notify("La clave debe tener al menos 4 caracteres", "error");
    dispatch({ type: "CHANGE_PORTAL_PASSWORD", id: pendingUser.id, password: newPassword });
    notify("Clave actualizada");
    onLogin(pendingUser.id);
  };
  return (
    <div className="mx-auto grid max-w-xl gap-5">
      <div className="panel grid gap-4">
        <h2 className="section-title"><KeyRound size={18} />Ingreso portal docente</h2>
        {!pendingUser ? (
          <>
            <Field label="Usuario"><input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="correo sin @ o usuario asignado" /></Field>
            <Field label="Clave"><input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Button onClick={login}><KeyRound size={16} />Ingresar</Button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300">Debes definir una nueva clave para continuar.</p>
            <Field label="Nueva clave"><input className={inputClass} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
            <Button onClick={changePassword}><Save size={16} />Guardar clave e ingresar</Button>
          </>
        )}
      </div>
    </div>
  );
}

function TeacherRequestsInbox() {
  const { state, dispatch, notify } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("pendiente");
  const [view, setView] = useState("kanban");
  const [requestReplies, setRequestReplies] = useState({});
  const [deletingRequest, setDeletingRequest] = useState(null);
  const requestStatusOptions = ["pendiente", "en preparación", "preparada", "aprobada", "entregada", "rechazada", "cerrada", "todas"];
  const requests = (state.requests || []).filter((request) => (status === "todas" || request.status === status) && `${request.requesterName} ${request.department || ""} ${request.items.map((item) => `${item.name} ${item.code}`).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const allRequests = state.requests || [];
  const kanbanStatuses = ["pendiente", "en preparación", "preparada", "entregada", "rechazada"];
  const pendingCount = allRequests.filter((r) => r.status === "pendiente").length;
  const preparingCount = allRequests.filter((r) => r.status === "en preparación").length;
  const readyCount = allRequests.filter((r) => r.status === "preparada").length;
  const approve = (request) => {
    const missing = request.items.find((item) => item.type === "material" && Number(state.materials.find((m) => m.id === item.id)?.stock || 0) < Number(item.qty));
    if (missing) return notify(`Stock insuficiente para ${missing.name}`, "error");
    dispatch({ type: "APPROVE_REQUEST", id: request.id, operatorName: state.settings.operatorName });
    notify("Solicitud entregada y convertida en prestamo");
  };
  const reject = (request) => {
    dispatch({ type: "UPDATE_REQUEST_STATUS", id: request.id, status: "rechazada", notes: "Rechazada desde bandeja" });
    notify("Solicitud rechazada");
  };
  const setRequestStatus = (request, nextStatus, notes = "") => {
    dispatch({ type: "UPDATE_REQUEST_STATUS", id: request.id, status: nextStatus, notes });
    notify(`Solicitud marcada como ${nextStatus}`);
  };
  const updatePrep = (request, index, prepStatus) => {
    dispatch({ type: "UPDATE_REQUEST_ITEM_PREP", requestId: request.id, index, status: prepStatus });
    notify("Preparación actualizada");
  };
  const sendRequestMessage = (request) => {
    const body = requestReplies[request.id]?.trim();
    if (!body) return notify("Escribe un comentario para enviar", "error");
    dispatch({ type: "SEND_MESSAGE", message: { teacherId: request.requesterId, teacherName: request.requesterName, requestId: request.id, requestTitle: `${displayFolio(request, "SOL")} · ${request.items.length} item(s)`, from: "pañol", to: "docente", body, read: false } });
    setRequestReplies({ ...requestReplies, [request.id]: "" });
    notify("Comentario enviado al docente");
  };
  const deleteRequest = () => {
    if (!deletingRequest) return;
    dispatch({ type: "DELETE_REQUEST", id: deletingRequest.id });
    notify("Solicitud eliminada");
    setDeletingRequest(null);
  };
  return (
    <div className="panel grid gap-5">
      <div className="grid gap-3 md:grid-cols-4">
        <button type="button" onClick={() => setStatus("todas")} className="rounded-md border border-steel-700 bg-steel-850 p-3 text-left transition hover:border-safety-500"><p className="text-sm text-slate-400">Total solicitudes</p><p className="text-3xl font-bold text-white">{allRequests.length}</p></button>
        <button type="button" onClick={() => setStatus("pendiente")} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-left transition hover:border-amber-400"><p className="text-sm text-slate-300">Pendientes</p><p className="text-3xl font-bold text-white">{pendingCount}</p></button>
        <button type="button" onClick={() => setStatus("en preparación")} className="rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-left transition hover:border-sky-400"><p className="text-sm text-slate-300">En preparación</p><p className="text-3xl font-bold text-white">{preparingCount}</p></button>
        <button type="button" onClick={() => setStatus("preparada")} className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-left transition hover:border-emerald-400"><p className="text-sm text-slate-300">Listas para retirar</p><p className="text-3xl font-bold text-white">{readyCount}</p></button>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <Field label="Buscar solicitud"><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Docente, departamento, material o código" /></div></Field>
        <Field label="Estado"><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>{requestStatusOptions.map((option) => <option key={option} value={option}>{option === "todas" ? "Todas" : option}</option>)}</select></Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant={view === "kanban" ? "primary" : "secondary"} onClick={() => setView("kanban")}><Inbox size={16} />Kanban</Button>
        <Button variant={view === "lista" ? "primary" : "secondary"} onClick={() => setView("lista")}><FileText size={16} />Lista</Button>
      </div>
      {view === "kanban" && (
        <div className="grid gap-3 xl:grid-cols-5">
          {kanbanStatuses.map((columnStatus) => {
            const columnRows = allRequests.filter((request) => request.status === columnStatus && `${request.requesterName} ${request.department || ""} ${request.items.map((item) => `${item.name} ${item.code}`).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
            return (
              <div key={columnStatus} className="rounded-md border border-steel-700 bg-steel-850 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="font-bold capitalize text-white">{columnStatus}</p>
                  <Badge tone={columnStatus === "rechazada" ? "red" : columnStatus === "preparada" ? "blue" : columnStatus === "entregada" ? "green" : "amber"}>{columnRows.length}</Badge>
                </div>
                <div className="grid gap-2">
                  {columnRows.slice(0, 8).map((request) => (
                    <button key={request.id} type="button" onClick={() => { setStatus(columnStatus); setView("lista"); }} className="rounded-md border border-steel-700 bg-steel-900 p-3 text-left transition hover:border-safety-500">
                      <p className="text-sm font-bold text-white">{displayFolio(request, "SOL")}</p>
                      <p className="mt-1 text-sm text-slate-300">{request.requesterName}</p>
                      <p className="mt-1 text-xs text-slate-400">{request.items.length} ítem(s) · {formatDate(request.expectedDate)}</p>
                    </button>
                  ))}
                  {columnRows.length === 0 && <p className="rounded-md border border-steel-700 bg-steel-900 p-3 text-xs text-slate-400">Sin solicitudes</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className={`grid gap-3 ${view === "lista" ? "" : "hidden"}`}>
        {requests.length === 0 && <div className="rounded-md border border-steel-700 bg-steel-850 p-6 text-center text-slate-400">Sin solicitudes para mostrar</div>}
        {requests.map((request) => <div key={request.id} className="rounded-md border border-steel-700 bg-steel-850 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div><p className="text-lg font-bold text-white"><span className="text-safety-500">{displayFolio(request, "SOL")}</span> · {request.requesterName}</p><p className="text-sm text-slate-400">{request.department || "Sin departamento"} · {formatDate(request.createdAt)} · solicitado para {formatDate(request.expectedDate)}</p><p className="mt-2 text-sm text-slate-300">{request.notes || "Sin observaciones"}</p></div>
            <Badge tone={request.status === "rechazada" ? "red" : request.status === "pendiente" || request.status === "en preparación" ? "amber" : request.status === "preparada" ? "blue" : "green"}>{request.status}</Badge>
          </div>
          <div className="mt-3 grid gap-2">
            {request.items.map((item, index) => <div key={`${request.id}-${index}`} className="grid gap-3 rounded-md border border-steel-700 bg-steel-900 p-3 md:grid-cols-[1fr_160px_auto] md:items-center">
              <div><p className="font-semibold text-white">{item.name}</p><p className="text-sm text-slate-400">{item.code} · cantidad {item.qty}</p></div>
              <Badge tone={item.prepStatus === "faltante" ? "red" : item.prepStatus === "reemplazar" ? "amber" : item.prepStatus === "preparado" ? "green" : "slate"}>{item.prepStatus || "sin preparar"}</Badge>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => updatePrep(request, index, "preparado")}><Check size={16} />Preparado</Button>
                <Button variant="secondary" onClick={() => updatePrep(request, index, "faltante")}><AlertTriangle size={16} />Faltante</Button>
                <Button variant="secondary" onClick={() => updatePrep(request, index, "reemplazar")}><RotateCcw size={16} />Reemplazar</Button>
              </div>
            </div>)}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <input className={inputClass} value={requestReplies[request.id] || ""} onChange={(e) => setRequestReplies({ ...requestReplies, [request.id]: e.target.value })} placeholder="Escribir comentario o consulta al docente" onKeyDown={(e) => { if (e.key === "Enter") sendRequestMessage(request); }} />
            <Button variant="secondary" onClick={() => sendRequestMessage(request)}><MessageSquare size={16} />Comentar</Button>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {request.status === "pendiente" && <Button variant="secondary" onClick={() => setRequestStatus(request, "en preparación", "Solicitud en preparación")}>Iniciar preparación</Button>}
            {["pendiente", "en preparación"].includes(request.status) && <Button variant="secondary" onClick={() => setRequestStatus(request, "preparada", "Solicitud preparada para retiro")}><FileCheck size={16} />Lista para retirar</Button>}
            {request.status !== "rechazada" && request.status !== "cerrada" && <Button variant="secondary" onClick={() => reject(request)}><X size={16} />Rechazar</Button>}
            {["pendiente", "en preparación", "preparada"].includes(request.status) && <Button onClick={() => approve(request)}><ShieldCheck size={16} />Entregar y prestar</Button>}
            {request.status === "entregada" && <Button onClick={() => setRequestStatus(request, "cerrada", "Solicitud cerrada")}><Check size={16} />Cerrar solicitud</Button>}
            <Button variant="danger" onClick={() => setDeletingRequest(request)}><Trash2 size={16} />Eliminar</Button>
          </div>
        </div>)}
      </div>
      {deletingRequest && <ConfirmModal title="Eliminar solicitud docente" body={`Se eliminará la solicitud de ${deletingRequest.requesterName} y los mensajes asociados a esta solicitud. Esta acción no se puede deshacer.`} onCancel={() => setDeletingRequest(null)} onConfirm={deleteRequest} />}
    </div>
  );
}

function MessagesCenter({ focusedTeacherId = "" }) {
  const { state, dispatch, notify } = useApp();
  const conversations = Object.values((state.messages || []).reduce((acc, msg) => {
    acc[msg.teacherId] = acc[msg.teacherId] || { teacherId: msg.teacherId, teacherName: msg.teacherName, last: msg, count: 0 };
    acc[msg.teacherId].count += 1;
    if (`${msg.date} ${msg.time}` > `${acc[msg.teacherId].last.date} ${acc[msg.teacherId].last.time}`) acc[msg.teacherId].last = msg;
    return acc;
  }, {}));
  const [selectedId, setSelectedId] = useState(conversations[0]?.teacherId || "");
  const [reply, setReply] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [deletingThread, setDeletingThread] = useState(null);
  useEffect(() => {
    if (focusedTeacherId) setSelectedId(focusedTeacherId);
  }, [focusedTeacherId]);
  const selected = conversations.find((conv) => conv.teacherId === selectedId) || conversations[0];
  const messages = selected ? (state.messages || []).filter((msg) => msg.teacherId === selected.teacherId).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)) : [];
  const selectedRequests = selected ? (state.requests || []).filter((request) => request.requesterId === selected.teacherId) : [];
  const activeRequest = selectedRequests.find((request) => request.id === selectedRequestId);
  const send = () => {
    if (!selected || !reply.trim()) return;
    dispatch({ type: "SEND_MESSAGE", message: { teacherId: selected.teacherId, teacherName: selected.teacherName, requestId: activeRequest?.id || "", requestTitle: activeRequest ? `${displayFolio(activeRequest, "SOL")} - ${activeRequest.items.length} item(s)` : "", from: "pañol", to: "docente", body: reply.trim(), read: false } });
    notify("Respuesta enviada");
    setReply("");
  };
  const deleteThread = () => {
    if (!deletingThread) return;
    dispatch({ type: "DELETE_MESSAGE_THREAD", teacherId: deletingThread.teacherId });
    notify("Conversación eliminada");
    setDeletingThread(null);
    setSelectedId("");
    setSelectedRequestId("");
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <div className="panel">
        <h2 className="section-title"><MessageSquare size={18} />Conversaciones</h2>
        <div className="grid gap-2">
          {conversations.length === 0 && <p className="text-sm text-slate-400">Sin mensajes de docentes</p>}
          {conversations.map((conv) => <div key={conv.teacherId} className={`grid gap-2 rounded-md border p-3 ${selected?.teacherId === conv.teacherId ? "border-safety-500 bg-safety-500/10" : "border-steel-700 bg-steel-850"}`}>
            <button type="button" onClick={() => { setSelectedId(conv.teacherId); setSelectedRequestId(""); }} className="text-left">
              <p className="font-bold">{conv.teacherName}</p>
              <p className="truncate text-sm text-slate-400">{conv.last.body}</p>
            </button>
            <Button variant="ghost" className="justify-start px-2 py-1 text-red-300" onClick={() => setDeletingThread(conv)}><Trash2 size={15} />Eliminar chat</Button>
          </div>)}
        </div>
      </div>
      <div className="panel grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="section-title mb-0"><MessageSquare size={18} />{selected?.teacherName || "Selecciona una conversación"}</h2>
          {selected && <Button variant="danger" onClick={() => setDeletingThread(selected)}><Trash2 size={16} />Eliminar conversación</Button>}
        </div>
        <div className="max-h-[520px] overflow-auto rounded-md border border-steel-700 bg-steel-850 p-3">
          {messages.map((msg) => <div key={msg.id} className={`mb-3 rounded-md p-3 ${msg.from === "pañol" ? "bg-safety-500/15" : "bg-steel-800"}`}><p className="text-xs text-slate-400">{msg.from === "pañol" ? "Pañol" : msg.teacherName} · {formatDate(msg.date)} {msg.time}</p>{msg.requestId && <button type="button" onClick={() => setSelectedRequestId(msg.requestId)} className="mb-2 mt-1 rounded-md border border-safety-500/40 bg-safety-500/10 px-2 py-1 text-xs font-semibold text-safety-500">{msg.requestTitle || "Solicitud asociada"}</button>}<p>{msg.body}</p></div>)}
        </div>
        <Field label="Asociar respuesta a solicitud">
          <select className={inputClass} value={selectedRequestId} onChange={(e) => setSelectedRequestId(e.target.value)} disabled={!selectedRequests.length}>
            <option value="">Chat general</option>
            {selectedRequests.map((request) => <option key={request.id} value={request.id}>{displayFolio(request, "SOL")} - {request.status} - {request.items.map((item) => item.name).join(", ")}</option>)}
          </select>
        </Field>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]"><input className={inputClass} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Responder al docente" onKeyDown={(e) => { if (e.key === "Enter") send(); }} /><Button onClick={send} disabled={!selected}><MessageSquare size={16} />Responder</Button></div>
      </div>
      {deletingThread && <ConfirmModal title="Eliminar conversación" body={`Se eliminará toda la conversación con ${deletingThread.teacherName}. Esta acción no se puede deshacer.`} onCancel={() => setDeletingThread(null)} onConfirm={deleteThread} />}
    </div>
  );
}

function PortalAccess() {
  const { state, dispatch, notify } = useApp();
  const [teacherId, setTeacherId] = useState(state.teachers[0]?.id || "");
  const teacher = state.teachers.find((person) => person.id === teacherId);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (teacher) setUsername(defaultPortalUsername(teacher));
  }, [teacherId, state.teachers.length]);
  const save = () => {
    if (!teacher || !username || !password) return notify("Selecciona docente, usuario y clave", "error");
    dispatch({ type: "UPSERT_PORTAL_USER", row: { teacherId: teacher.id, teacherName: teacher.name, email: teacher.email || "", username, password, active: true, mustChangePassword: true } });
    notify("Acceso docente creado");
    setPassword("");
  };
  const users = state.portalUsers || [];
  return (
    <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <div className="panel grid gap-4">
        <h2 className="section-title"><KeyRound size={18} />Crear acceso docente</h2>
        <Field label="Docente"><select className={inputClass} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>{state.teachers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
        <Field label="Usuario"><input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="correo sin arroba" /></Field>
        <Field label="Clave inicial"><input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="clave temporal" /></Field>
        <p className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-200">El docente deberá cambiar esta clave en su primer ingreso. En esta versión local la clave queda guardada en localStorage.</p>
        <Button onClick={save}><Save size={16} />Crear acceso</Button>
      </div>
      <div className="panel">
        <h2 className="section-title"><UsersRound size={18} />Docentes habilitados</h2>
        <DataTable rows={users.map((user) => ({ ...user, status: user.active ? "activo" : "inactivo", change: user.mustChangePassword ? "pendiente" : "definida" }))} columns={[["teacherName", "Docente"], ["username", "Usuario"], ["email", "Email"], ["status", "Estado"], ["change", "Clave"]]} actions={(row) => (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="px-2" onClick={() => { dispatch({ type: "UPSERT_PORTAL_USER", row: { ...row, active: !row.active } }); notify(row.active ? "Acceso desactivado" : "Acceso activado"); }}>{row.active ? "Desactivar" : "Activar"}</Button>
            <Button variant="ghost" className="px-2 text-red-300" onClick={() => { dispatch({ type: "DELETE_PORTAL_USER", id: row.id }); notify("Acceso eliminado"); }}><Trash2 size={16} /></Button>
          </div>
        )} compact />
      </div>
    </div>
  );
}

function defaultPortalUsername(teacher) {
  if (teacher?.email?.includes("@")) return teacher.email.split("@")[0].toLowerCase();
  return normalizeHeader(teacher?.name || "").replace(/\s+/g, ".");
}

function Filters({ query, setQuery, status, setStatus }) {
  return <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por fecha, solicitante o detalle" /></div><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="todos">Todos los estados</option><option value="activo">Activo</option><option value="devuelto">Devuelto</option><option value="parcial">Parcial</option><option value="importado">Importado</option></select></div>;
}

async function parseDatabaseFile(file, collection) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".json")) return JSON.parse(await file.text());
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) return parseWorkbook(await file.arrayBuffer(), collection);
  return parseCSV(await file.text());
}

function parseWorkbook(buffer, collection) {
  const workbook = XLSX.read(buffer, { type: "array" });
  return workbook.SheetNames.flatMap((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const table = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    if (collection === "students") return parseStudentSheet(table, sheetName);
    return parseGenericSheet(table, collection);
  });
}

function parseStudentSheet(table, sheetName) {
  const rawCourse = table[0]?.[1] || sheetName;
  const course = normalizeHumanistCourse(String(rawCourse || sheetName));
  const headers = (table[3] || []).map(normalizeHeader);
  return table.slice(4)
    .map((values) => rowFromHeaders(headers, values))
    .filter((row) => row.run || row.rut || row.email || row.nombres)
    .map((row) => {
      const firstNames = row.nombres || row.nombre || "";
      const paternal = row.apellido_paterno || row["apellido paterno"] || "";
      const maternal = row.apellido_materno || row["apellido materno"] || "";
      return {
        name: [firstNames, paternal, maternal].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
        rut: row.run || row.rut || row.id || "",
        course,
        email: row.email || row.correo || "",
        phone: row.telefono || ""
      };
    });
}

function parseGenericSheet(table, collection) {
  const headerIndex = findHeaderRowIndex(table, collection);
  const headers = (table[headerIndex] || []).map(normalizeHeader);
  return table.slice(headerIndex + 1)
    .map((values) => rowFromHeaders(headers, values))
    .filter((row) => Object.values(row).some(Boolean));
}

function findHeaderRowIndex(table, collection) {
  const expectedByCollection = {
    teachers: ["nombre", "departamento", "email"],
    materials: ["nombre", "codigo", "stock"],
    tools: ["nombre", "codigo", "estado"]
  };
  const expected = expectedByCollection[collection] || ["nombre"];
  const index = table.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return expected.every((header) => normalized.some((cell) => cell.includes(header)));
  });
  return index >= 0 ? index : 3;
}

function rowFromHeaders(headers, values) {
  return headers.reduce((row, header, index) => {
    if (header) row[header] = String(values[index] ?? "").trim();
    return row;
  }, {});
}

function normalizeHumanistCourse(course) {
  return course
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bA$/i, "E")
    .replace(/\bB$/i, "F");
}

function DatabaseImport() {
  const { state, dispatch, notify } = useApp();
  const [collection, setCollection] = useState("students");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const config = configs[collection];
  const onFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    const parsed = await parseDatabaseFile(file, collection);
    setRows(parsed.map((row) => normalizeImportedRow(row, collection)));
  };
  const importRows = () => {
    if (!rows.length) return notify("Carga un archivo CSV o JSON", "error");
    dispatch({ type: "BULK_UPSERT", collection, prefix: config.prefix, rows });
    notify(`${rows.length} registros importados`);
    setRows([]);
    setFileName("");
  };
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
      <div className="panel grid gap-4">
        <h2 className="section-title"><Database size={18} />Importar alumnos, profesores o inventario</h2>
        <Field label="Base de datos destino">
          <select className={inputClass} value={collection} onChange={(e) => { setCollection(e.target.value); setRows([]); }}>
            <option value="students">Alumnos</option>
            <option value="teachers">Profesores</option>
            <option value="materials">Materiales</option>
            <option value="tools">Herramientas</option>
          </select>
        </Field>
        <Field label="Archivo Excel, CSV o JSON">
          <input className={inputClass} type="file" accept=".csv,.json,.xlsx,.xls,text/csv,application/json" onChange={(e) => onFile(e.target.files?.[0])} />
        </Field>
        <div className="rounded-md border border-steel-700 bg-steel-850 p-3 text-sm text-slate-300">
          <p className="font-semibold text-white">Columnas esperadas</p>
          <p className="mt-1">{config.fields.map(([, label]) => label).join(", ")}</p>
          {collection === "students" && <p className="mt-2 text-safety-500">Excel de cursos: lee todas las hojas desde la fila 4 y convierte cursos humanistas A/B en E/F.</p>}
        </div>
        <Button onClick={importRows}><FileSpreadsheet size={16} />Importar base de datos</Button>
      </div>
      <div className="panel">
        <h2 className="section-title"><FileText size={18} />Vista previa {fileName && `· ${fileName}`}</h2>
        <EditablePreview rows={rows} setRows={setRows} config={config} />
      </div>
      </div>
      <StudentPhotoImport students={state.students || []} dispatch={dispatch} notify={notify} />
    </div>
  );
}

function StudentPhotoImport({ students, dispatch, notify }) {
  const [photoRows, setPhotoRows] = useState([]);
  const [processing, setProcessing] = useState(false);
  const studentsByRut = useMemo(() => {
    const entries = (students || [])
      .map((student) => [normalizeRut(student.rut), student])
      .filter(([rut]) => rut);
    return new Map(entries);
  }, [students]);
  const matchedRows = photoRows.filter((row) => row.student);
  const unmatchedRows = photoRows.filter((row) => !row.student);
  const onPhotos = (fileList) => {
    const imageFiles = Array.from(fileList || []).filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name));
    const parsed = imageFiles.map((file) => {
      const rut = rutFromPhotoFileName(file.name);
      const course = courseFromPhotoPath(file.webkitRelativePath || file.name);
      return {
        file,
        fileName: file.name,
        rut,
        course,
        student: studentsByRut.get(rut) || null
      };
    });
    setPhotoRows(parsed);
    notify(`${parsed.length} foto(s) leida(s), ${parsed.filter((row) => row.student).length} con coincidencia por RUT`);
  };
  const importPhotos = async () => {
    if (!matchedRows.length) return notify("No hay fotos con coincidencia para importar", "error");
    setProcessing(true);
    try {
      const photos = [];
      for (const row of matchedRows) {
        const photoKey = studentPhotoKey(row.rut);
        const photoUrl = await resizeStudentPhoto(row.file);
        await saveStudentPhoto(photoKey, photoUrl);
        photos.push({
          rut: row.rut,
          course: row.course,
          fileName: row.fileName,
          photoKey
        });
      }
      dispatch({ type: "IMPORT_STUDENT_PHOTOS", photos });
      notify(`${photos.length} foto(s) asociada(s) a alumnos`);
      setPhotoRows([]);
    } catch (error) {
      notify(`No se pudieron importar las fotos: ${error.message || error}`, "error");
    } finally {
      setProcessing(false);
    }
  };
  return (
    <div className="panel grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="section-title"><GraduationCap size={18} />Fotos de estudiantes</h2>
          <p className="text-sm text-slate-400">Selecciona la carpeta MEDIA o un curso completo. La asociacion se hace por RUT desde el nombre del archivo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-steel-700 bg-steel-800 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-steel-700">
            <Upload size={16} />Seleccionar carpeta/fotos
            <input className="hidden" type="file" accept="image/*" multiple webkitdirectory="" directory="" onChange={(event) => onPhotos(event.target.files)} />
          </label>
          <Button disabled={!matchedRows.length || processing} onClick={importPhotos}><Save size={16} />{processing ? "Procesando..." : "Asociar fotos"}</Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Fotos leidas</p><p className="text-2xl font-bold text-white">{photoRows.length}</p></div>
        <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3"><p className="text-sm text-green-200">Con coincidencia</p><p className="text-2xl font-bold text-white">{matchedRows.length}</p></div>
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3"><p className="text-sm text-amber-200">Por revisar</p><p className="text-2xl font-bold text-white">{unmatchedRows.length}</p></div>
      </div>
      {photoRows.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-white">Coincidencias encontradas</p>
            <DataTable rows={matchedRows.slice(0, 12).map((row) => ({ name: row.student.name, rut: row.rut, course: row.course || row.student.course, fileName: row.fileName }))} columns={[["name", "Alumno"], ["rut", "RUT"], ["course", "Curso"], ["fileName", "Archivo"]]} compact />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-white">Sin coincidencia por RUT</p>
            <DataTable rows={unmatchedRows.slice(0, 12).map((row) => ({ rut: row.rut || "Sin RUT detectado", course: row.course, fileName: row.fileName }))} columns={[["rut", "RUT detectado"], ["course", "Carpeta"], ["fileName", "Archivo"]]} compact />
          </div>
        </div>
      )}
    </div>
  );
}

function EditablePreview({ rows, setRows, config }) {
  const visible = rows.slice(0, 25);
  if (!rows.length) return <DataTable rows={[]} columns={config.columns} compact />;
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-lg border border-steel-700">
        <table className="min-w-full divide-y divide-steel-700 text-sm">
          <thead className="bg-steel-800 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>{config.columns.map(([, label]) => <th key={label} className="px-3 py-2">{label}</th>)}<th className="px-3 py-2 text-right">Quitar</th></tr>
          </thead>
          <tbody className="divide-y divide-steel-800">
            {visible.map((row, index) => (
              <tr key={index}>
                {config.columns.map(([key]) => <td key={key} className="px-2 py-2"><input className={inputClass} value={row[key] ?? ""} onChange={(e) => setRows(rows.map((item, ix) => ix === index ? { ...item, [key]: e.target.value } : item))} /></td>)}
                <td className="px-2 py-2 text-right"><Button variant="ghost" className="px-2 text-red-300" onClick={() => setRows(rows.filter((_, ix) => ix !== index))}><X size={16} /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > visible.length && <p className="text-sm text-slate-400">Mostrando 25 de {rows.length} registros. Se importarán todos los registros restantes.</p>}
    </div>
  );
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const separator = (lines[0].match(/;/g)?.length || 0) > (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
  const headers = splitCSVLine(lines[0], separator).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line, separator);
    return headers.reduce((row, header, ix) => ({ ...row, [header]: values[ix]?.trim() || "" }), {});
  });
}

function splitCSVLine(line, separator = ",") {
  const values = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) {
      values.push(current);
      current = "";
    } else current += char;
  }
  values.push(current);
  return values;
}

function normalizeImportedRow(row, collection) {
  row = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
  const aliases = {
    name: ["nombre", "name", "producto", "material", "herramienta"],
    rut: ["rut", "id", "run"],
    course: ["curso", "carrera", "course"],
    department: ["departamento", "department"],
    email: ["email", "correo"],
    phone: ["telefono", "teléfono", "phone"],
    code: ["codigo", "código", "code", "sku"],
    category: ["categoria", "categoría", "category"],
    stock: ["stock", "stock actual", "cantidad", "cantidad actual", "existencia", "existencias", "saldo"],
    minStock: ["stock minimo", "stock mínimo", "minimo", "mínimo", "minstock", "stock critico", "stock crítico"],
    unit: ["unidad", "unit"],
    location: ["ubicacion", "ubicación", "location"],
    status: ["estado", "status"],
    description: ["descripcion", "descripción", "description"]
  };
  const get = (key) => {
    const found = aliases[key].map(normalizeHeader).find((alias) => row[alias] !== undefined);
    return found ? row[found] : "";
  };
  if (collection === "students") return { name: get("name"), rut: get("rut"), course: get("course"), email: get("email"), phone: get("phone") };
  if (collection === "teachers") return { name: get("name"), department: get("department"), email: get("email") };
  if (collection === "materials") return { name: get("name"), code: get("code"), category: get("category") || "Sin clasificar", stock: Number(get("stock") || 0), minStock: Number(get("minStock") || 5), unit: get("unit") || "un", location: get("location") || "Por asignar" };
  return { name: get("name"), code: get("code"), status: get("status") || "disponible", description: get("description") };
}

function normalizeHeader(value) {
  return String(value)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function Invoices() {
  const { state, dispatch, notify } = useApp();
  const [provider, setProvider] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [document, setDocument] = useState(null);
  const [preview, setPreview] = useState("");
  const emptyInvoiceItem = { name: "", code: "", category: "", qty: 1 };
  const [items, setItems] = useState([emptyInvoiceItem]);
  const [extracting, setExtracting] = useState(false);
  const [extractionNote, setExtractionNote] = useState("");
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState({ provider: "", invoiceNumber: "", documentName: "" });
  const materialCategories = Array.from(new Set(state.materials.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const findMaterialMatch = (item) => {
    const name = normalizeHeader(item.name || "");
    const code = normalizeHeader(item.code || "");
    return state.materials.find((material) => (code && normalizeHeader(material.code || "") === code) || (name && normalizeHeader(material.name || "") === name));
  };
  const previewGeneratedCode = (item, index) => {
    const match = findMaterialMatch(item);
    if (match) return match.code;
    if (item.code) return item.code;
    const priorGenerated = [];
    items.slice(0, index).forEach((prior) => {
      if (prior.code || findMaterialMatch(prior) || !prior.name) return;
      const code = generateEntityCode({ ...state, materials: [...state.materials, ...priorGenerated] }, "materials", { category: prior.category || "Sin clasificar" });
      priorGenerated.push({ code, category: prior.category || "Sin clasificar" });
    });
    return generateEntityCode({ ...state, materials: [...state.materials, ...priorGenerated] }, "materials", { category: item.category || "Sin clasificar" });
  };
  const updateInvoiceItem = (index, patch) => {
    setItems((current) => current.map((item, ix) => {
      if (ix !== index) return item;
      const next = { ...item, ...patch };
      const match = findMaterialMatch(next);
      return match ? { ...next, name: match.name, code: match.code, category: match.category || next.category } : next;
    }));
  };
  const onFile = (file) => {
    setDocument(file);
    setPreview(file ? URL.createObjectURL(file) : "");
    setExtractionNote("");
  };
  const extractItems = async () => {
    if (!document) return notify("Sube un PDF o imagen primero", "error");
    setExtracting(true);
    const runOcr = async (reason) => {
      if (!isSupabaseConfigured || !supabase) {
        setExtractionNote(`${reason} OCR requiere Supabase conectado y la función invoice-ocr desplegada.`);
        notify("OCR requiere Supabase", "error");
        return false;
      }
      setExtractionNote(`${reason} Ejecutando OCR sobre la imagen de la factura...`);
      const images = document.type === "application/pdf" || document.name.toLowerCase().endsWith(".pdf")
        ? await renderPdfPageImages(document, 2)
        : [await fileToDataUrl(document)];
      const { data, error } = await supabase.functions.invoke("invoice-ocr", {
        body: { documentName: document.name, images }
      });
      if (error) throw error;
      if (data?.source === "missing-openai-key") {
        setExtractionNote("OCR disponible, pero falta configurar OPENAI_API_KEY en Supabase secrets.");
        notify("Falta clave OCR en Supabase", "error");
        return false;
      }
      if (data?.source === "openai-error" || data?.source === "function-error") {
        setExtractionNote(`OCR no pudo procesar la factura: ${data.detail || "error desconocido"}`);
        notify("OCR no pudo leer la factura", "error");
        return false;
      }
      const parsed = Array.isArray(data?.items) ? data.items : [];
      if (!parsed.length) {
        setExtractionNote("OCR terminó, pero no encontró productos claros. Puedes cargarlos manualmente.");
        notify("OCR sin productos detectados", "error");
        return false;
      }
      setItems(parsed.map((item) => ({ ...emptyInvoiceItem, ...item, qty: Number(item.qty) || 1 })));
      setExtractionNote(`OCR detectó ${parsed.length} ítem(s). Revisa códigos, categorías y cantidades antes de importar.`);
      notify("OCR completado");
      return true;
    };
    try {
      if (document.type !== "application/pdf" && !document.name.toLowerCase().endsWith(".pdf")) {
        await runOcr("La imagen requiere OCR.");
        return;
      }
      const extractedText = await readPdfText(document);
      if (!extractedText.trim()) {
        await runOcr("El PDF se abrió, pero no entregó texto seleccionable.");
        return;
      }
      const parsed = parseInvoiceDescriptions(extractedText);
      if (!parsed.length) {
        const ocrWorked = await runOcr("Pude leer texto del PDF, pero no identifiqué productos claros.");
        if (!ocrWorked) notify("No se detectaron descripciones automáticamente", "error");
      } else {
        setItems(parsed.map((item) => ({ ...emptyInvoiceItem, ...item })));
        setExtractionNote(`Se detectaron ${parsed.length} descripciones. Ingresa manualmente las cantidades antes de importar.`);
        notify("Descripciones extraídas desde el PDF");
      }
    } catch (error) {
      try {
        const ocrWorked = await runOcr(`No fue posible leer el PDF como texto: ${error?.message || "error desconocido"}.`);
        if (!ocrWorked) notify("No se pudo leer el PDF", "error");
      } catch (ocrError) {
        setExtractionNote(`No fue posible ejecutar OCR: ${ocrError?.message || "error desconocido"}. Puedes usar carga manual.`);
        notify("No se pudo ejecutar OCR", "error");
      }
    } finally {
      setExtracting(false);
    }
  };
  const importInvoice = () => {
    const valid = items
      .map((item, index) => ({ ...item, code: item.code || previewGeneratedCode(item, index), category: item.category || findMaterialMatch(item)?.category || "Sin clasificar" }))
      .filter((i) => i.name && Number(i.qty) > 0);
    if (!provider || valid.length === 0) return notify("Completa proveedor e ítems", "error");
    dispatch({ type: "IMPORT_INVOICE", provider, invoiceNumber: invoiceNumber.trim(), documentName: document?.name || "sin-documento", items: valid });
    notify("Factura importada al inventario");
    setProvider("");
    setInvoiceNumber("");
    setItems([emptyInvoiceItem]);
    setDocument(null);
    setPreview("");
  };
  const startInvoiceEdit = (invoice) => {
    setEditingInvoice(invoice);
    setInvoiceDraft({
      provider: invoice.provider || "",
      invoiceNumber: invoice.invoiceNumber || "",
      documentName: invoice.documentName || ""
    });
  };
  const saveInvoiceEdit = () => {
    if (!editingInvoice) return;
    dispatch({
      type: "UPDATE_INVOICE",
      id: editingInvoice.id,
      patch: {
        provider: invoiceDraft.provider.trim() || "Sin proveedor",
        invoiceNumber: invoiceDraft.invoiceNumber.trim(),
        documentName: invoiceDraft.documentName.trim() || "sin-documento"
      }
    });
    notify("Factura actualizada");
    setEditingInvoice(null);
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <div className="panel grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Proveedor"><input className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Nombre del proveedor" /></Field>
          <Field label="N° factura"><input className={inputClass} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ej: 12345" /></Field>
          <Field label="Subir factura"><input className={inputClass} type="file" accept="image/*,.pdf" onChange={(e) => onFile(e.target.files?.[0])} /></Field>
        </div>
        <div className="rounded-lg border border-dashed border-steel-700 bg-steel-850 p-4">
          {preview ? document?.type === "application/pdf" ? <iframe title="Vista previa" src={preview} className="h-80 w-full rounded-md bg-white" /> : <img src={preview} alt="Vista previa de factura" className="max-h-80 rounded-md object-contain" /> : <div className="grid h-44 place-items-center text-slate-400"><Upload size={34} />Vista previa del documento</div>}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-steel-700 bg-steel-850 p-3">
          <Button variant="secondary" disabled={!document || extracting} onClick={extractItems}><Wand2 size={16} />{extracting ? "Leyendo factura..." : "Leer PDF/OCR automáticamente"}</Button>
          <p className="text-sm text-slate-400">{extractionNote || "Primero intenta texto embebido. Si la factura es escaneada, usa OCR con IA."}</p>
        </div>
        <div className="grid gap-3">
          <datalist id="invoice-materials">
            {state.materials.map((material) => <option key={material.id} value={material.name}>{material.code} · {material.category}</option>)}
          </datalist>
          <datalist id="invoice-categories">
            {materialCategories.map((category) => <option key={category} value={category} />)}
          </datalist>
          {items.map((item, ix) => {
            const match = findMaterialMatch(item);
            const generatedCode = previewGeneratedCode(item, ix);
            return (
              <div key={ix} className="grid gap-2 rounded-md border border-steel-700 bg-steel-850 p-3">
                <div className="grid gap-3 md:grid-cols-[1fr_190px_180px_120px_auto]">
                  <input className={inputClass} list="invoice-materials" placeholder="Producto o buscar existente" value={item.name} onChange={(e) => updateInvoiceItem(ix, { name: e.target.value })} />
                  <input className={inputClass} placeholder={generatedCode ? `Auto: ${generatedCode}` : "Código"} value={item.code} onChange={(e) => updateInvoiceItem(ix, { code: e.target.value })} />
                  <input className={inputClass} list="invoice-categories" placeholder="Categoría" value={item.category} onChange={(e) => updateInvoiceItem(ix, { category: e.target.value })} />
                  <input className={inputClass} type="number" min="1" value={item.qty} onChange={(e) => updateInvoiceItem(ix, { qty: Number(e.target.value) })} />
                  <Button variant="ghost" className="px-2 text-red-300" onClick={() => setItems(items.filter((_, i) => i !== ix))}><X size={16} /></Button>
                </div>
                <p className="text-xs text-slate-400">
                  {match ? `Coincide con inventario: ${match.code} · ${match.category}. Se sumará stock a este registro.` : `Nuevo registro: se importará como ${item.category || "Sin clasificar"} con código ${generatedCode}.`}
                </p>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-between gap-2"><Button variant="secondary" onClick={() => setItems([...items, emptyInvoiceItem])}><Plus size={16} />Agregar ítem</Button><Button onClick={importInvoice}><PackagePlus size={16} />Importar al inventario</Button></div>
      </div>
      <div className="panel">
        <h2 className="section-title"><FileText size={18} />Historial de facturas</h2>
        <div className="grid gap-2">
          {state.invoices.length === 0 && <div className="rounded-lg border border-steel-700 px-4 py-8 text-center text-sm text-slate-400">Sin registros para mostrar</div>}
          {state.invoices.map((invoice) => (
            <div key={invoice.id} className="grid gap-3 rounded-lg border border-steel-700 bg-steel-900 p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-slate-100">{invoice.invoiceNumber ? `Factura ${invoice.invoiceNumber}` : "Factura sin numero"}</strong>
                  <Badge tone="blue">{invoice.itemsCount || 0} item(s)</Badge>
                </div>
                <div className="mt-1 text-slate-700 dark:text-slate-300">{invoice.provider || "Sin proveedor"} · {formatDate(invoice.date)}</div>
                <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={invoice.documentName || ""}>{invoice.documentName || "sin documento"}</div>
              </div>
              <Button variant="secondary" className="justify-center px-3" onClick={() => startInvoiceEdit(invoice)} title="Editar factura"><Edit3 size={16} />Editar</Button>
            </div>
          ))}
        </div>
      </div>
      {editingInvoice && (
        <Modal title="Editar factura" onClose={() => setEditingInvoice(null)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Proveedor"><input className={inputClass} value={invoiceDraft.provider} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, provider: e.target.value })} /></Field>
            <Field label="N° factura"><input className={inputClass} value={invoiceDraft.invoiceNumber} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, invoiceNumber: e.target.value })} placeholder="Ej: 12345" /></Field>
            <Field label="Documento asociado"><input className={inputClass} value={invoiceDraft.documentName} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, documentName: e.target.value })} /></Field>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingInvoice(null)}><X size={16} />Cancelar</Button>
            <Button onClick={saveInvoiceEdit}><Save size={16} />Guardar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

async function readPdfText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    // pdf.js can detach the ArrayBuffer it receives. Keep independent byte copies
    // so the raw-text fallback can still run when parsing fails or returns empty.
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      return groupPdfTextRows(content.items);
    }));
    const text = pages.join("\n");
    return text.trim() ? text : readRawPdfText(bytes);
  } catch (error) {
    const fallback = readRawPdfText(bytes);
    if (fallback.trim()) return fallback;
    throw error;
  }
}

async function renderPdfPageImages(file, maxPages = 2) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const images = [];
  for (let index = 1; index <= pageCount; index += 1) {
    const page = await pdf.getPage(index);
    const viewport = page.getViewport({ scale: 2.2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.86));
  }
  return images;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

async function readLessonContextFile(file) {
  if (!file) return "";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return readPdfText(file);
  if (file.type.startsWith("text/") || /\.(txt|csv|md)$/i.test(file.name)) return file.text();
  throw new Error("Formato no soportado");
}

function groupPdfTextRows(items) {
  const rows = [];
  items.filter((item) => item.str?.trim()).forEach((item) => {
    const x = item.transform?.[4] || 0;
    const y = Math.round((item.transform?.[5] || 0) / 3) * 3;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 3);
    if (!row) {
      row = { y, cells: [] };
      rows.push(row);
    }
    row.cells.push({ x, text: item.str.trim() });
  });
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join(" | "))
    .join("\n");
}

function readRawPdfText(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const matches = [
    ...binary.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g),
    ...binary.matchAll(/\[(?:.|\n|\r)*?\]\s*TJ/g)
  ];
  return matches
    .map((match) => match[0].replace(/\]\s*TJ|\s*Tj/g, ""))
    .map((chunk) => [...chunk.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((part) => decodePdfLiteral(part[0].slice(1, -1))).join(" "))
    .join("\n");
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function parseInvoiceItems(text) {
  const tableItems = parseInvoiceTableByHeaders(text);
  const crystalItems = parseCrystalReportItems(text);
  const streamItems = parseCrystalTokenStream(text);
  const combined = mergeInvoiceItems([...tableItems, ...crystalItems, ...streamItems]);
  if (combined.length) return combined;
  const lines = text.split(/\r?\n/).flatMap((line) => line.split(/\s{2,}/)).map((line) => line.trim()).filter((line) => line.length > 5);
  const ignored = /total|subtotal|iva|neto|factura|rut|direccion|dirección|fecha|proveedor|giro/i;
  const items = [];
  for (const line of lines) {
    if (ignored.test(line)) continue;
    const qtyMatch = line.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)\s*(?:un|und|unidad|u|m|kg|lt|rollo|par)?\b/i);
    if (!qtyMatch) continue;
    const qty = Number(qtyMatch[1].replace(",", "."));
    const name = line
      .replace(qtyMatch[0], " ")
      .replace(/\$?\s?\d{1,3}(?:\.\d{3})+(?:,\d+)?/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (isLikelyProductName(name) && qty > 0) items.push({ name, code: "", qty });
  }
  return items.slice(0, 30);
}

function parseInvoiceDescriptions(text) {
  const descriptions = mergeDescriptions([
    ...parseCrystalDescriptions(text),
    ...parseDescriptionsByHeaders(text),
    ...parseDescriptionFallback(text)
  ]);
  return descriptions.map((name) => ({ name, code: "", qty: 1 })).slice(0, 50);
}

function mergeDescriptions(descriptions) {
  const seen = new Set();
  return descriptions
    .map(cleanProductName)
    .filter(isLikelyProductName)
    .filter((name) => {
      const key = normalizeHeader(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseDescriptionsByHeaders(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalizeHeader(line);
    return normalized.includes("detalle") || normalized.includes("descripcion");
  });
  if (headerIndex < 0) return [];
  const headers = lines[headerIndex].split("|").map(normalizeHeader);
  const detailIndex = headers.findIndex((header) => header.includes("detalle") || header.includes("descripcion"));
  if (detailIndex < 0) return [];
  const descriptions = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (isInvoiceFooter(line)) break;
    if (!hasInvoiceProductRowShape(line)) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells[detailIndex]) descriptions.push(cells[detailIndex]);
  }
  return descriptions;
}

function parseCrystalDescriptions(text) {
  const normalizedText = text.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  const tokens = normalizedText.split(" ").filter(Boolean);
  const starts = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (isItemCodeToken(tokens[index]) && isUnitToken(tokens[index + 1])) starts.push(index);
  }
  return starts.flatMap((start, startIndex) => {
    const end = starts[startIndex + 1] || Math.min(tokens.length, start + 50);
    const segment = tokens.slice(start + 2, end);
    const numericIndexes = segment.map((token, ix) => (isNumberToken(token) ? ix : -1)).filter((ix) => ix >= 0);
    if (numericIndexes.length < 2) return [];
    const detailEnd = numericIndexes.length >= 3 ? numericIndexes[numericIndexes.length - 3] : numericIndexes[0];
    const name = cleanProductName(segment.slice(0, detailEnd).join(" "));
    return name ? [name] : [];
  });
}

function hasInvoiceProductRowShape(line) {
  const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
  if (cells.some(isItemCodeToken) && cells.some(isUnitToken)) return true;
  const compact = line.replace(/\|/g, " ");
  return /\b[A-Z0-9-]{5,14}\s+(UN|UND|KG|MT|M|LT|PAR)\b/i.test(compact);
}

function parseDescriptionFallback(text) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\|/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  return lines.flatMap((line) => {
    if (isInvoiceFooter(line)) return [];
    const match = line.match(/\b[A-Z0-9-]{5,14}\s+(?:UN|UND|KG|MT|M|LT|PAR)\s+(.+?)(?:\s+\d+(?:[.,]\d+)?\s+\d[\d.,]*\s+\d[\d.,]*|$)/i);
    if (match?.[1]) return [match[1]];

    const keywordMatch = line.match(/\b((?:CINTA|INTERRUPTOR|CANALETA|ANGULO|ÁNGULO|ENCHUFE|TOMA|CABLE|TERMINAL|TORNILLO|BROCA|MODULO|MÓDULO|CONDENSADOR|RESISTENCIA|SENSOR|FUENTE|TRANSFORMADOR)\b.+?)(?:\s+\d+(?:[.,]\d+)?\s+\d[\d.,]*\s+\d[\d.,]*|$)/i);
    return keywordMatch?.[1] ? [keywordMatch[1]] : [];
  });
}

function mergeInvoiceItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${normalizeHeader(item.name)}-${item.qty}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

function parseInvoiceTableByHeaders(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalizeHeader(line);
    return /(detalle|descripcion|descripci[oó]n)/i.test(normalized) && /cantidad/i.test(normalized);
  });
  if (headerIndex < 0) return [];
  const headers = lines[headerIndex].split("|").map(normalizeHeader);
  const detailIndex = headers.findIndex((header) => header.includes("detalle") || header.includes("descripcion"));
  const qtyIndex = headers.findIndex((header) => header.includes("cantidad"));
  if (detailIndex < 0 || qtyIndex < 0) return [];

  const items = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (isInvoiceFooter(line)) break;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length <= Math.max(detailIndex, qtyIndex)) continue;
    const name = cleanProductName(cells[detailIndex]);
    const qty = parseQuantity(cells[qtyIndex]);
    if (isLikelyProductName(name) && qty > 0) items.push({ name, code: "", qty });
  }
  return items.slice(0, 30);
}

function parseCrystalReportItems(text) {
  const rows = text.split(/\r?\n/).map((line) => line.replaceAll("|", " ").trim()).filter(Boolean);
  const items = [];
  for (const row of rows) {
    if (isInvoiceFooter(row)) break;
    const tokens = row.split(/\s+/);
    if (tokens.length < 6 || !/^[A-Z0-9-]{5,14}$/i.test(tokens[0]) || !/^(UN|UND|KG|MT|M|LT|PAR)$/i.test(tokens[1])) continue;
    const numericIndexes = tokens.map((token, index) => (/^\d+(?:[.,]\d+)?$/.test(token) ? index : -1)).filter((index) => index >= 0);
    if (numericIndexes.length < 3) continue;
    const qtyIndex = numericIndexes[numericIndexes.length - 3];
    const name = cleanProductName(tokens.slice(2, qtyIndex).join(" "));
    const qty = parseQuantity(tokens[qtyIndex]);
    if (isLikelyProductName(name) && qty > 0) items.push({ name, code: "", qty });
  }
  return items.slice(0, 30);
}

function parseCrystalTokenStream(text) {
  const normalizedText = text
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalizedText.split(" ").filter(Boolean);
  const starts = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (isItemCodeToken(tokens[index]) && isUnitToken(tokens[index + 1])) starts.push(index);
  }
  const items = [];
  starts.forEach((start, startIndex) => {
    const end = starts[startIndex + 1] || Math.min(tokens.length, start + 50);
    const segment = tokens.slice(start + 2, end);
    const numericIndexes = segment.map((token, ix) => (isNumberToken(token) ? ix : -1)).filter((ix) => ix >= 0);
    if (numericIndexes.length < 3) return;

    const qtyIndex = numericIndexes[numericIndexes.length - 3];
    const name = cleanProductName(segment.slice(0, qtyIndex).join(" "));
    const qty = parseQuantity(segment[qtyIndex]);
    if (isLikelyProductName(name) && qty > 0) items.push({ name, code: "", qty });
  });
  return items.slice(0, 30);
}

function findNextItemStart(tokens, start) {
  for (let index = start; index < tokens.length - 1; index += 1) {
    if (isItemCodeToken(tokens[index]) && isUnitToken(tokens[index + 1])) return index;
  }
  return -1;
}

function isNumberToken(value) {
  return /^\d+(?:[.,]\d+)?$/.test(String(value));
}

function isItemCodeToken(value) {
  const token = String(value);
  return /^(?=.*\d)[A-Z0-9-]{5,14}$/i.test(token);
}

function isUnitToken(value) {
  return /^(UN|UND|KG|MT|M|LT|PAR)$/i.test(String(value));
}

function parseQuantity(value) {
  const match = String(value).match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : 0;
}

function cleanProductName(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/^\W+|\W+$/g, "")
    .trim();
}

function isLikelyProductName(value) {
  const text = cleanProductName(value);
  return /[a-záéíóúñ]/i.test(text)
    && text.length >= 4
    && !/^\d|rut|fecha|giro|comuna|ciudad|direccion|dirección|cliente|vendedor|total|subtotal|iva|convenir|concepcion|pesos|boleta|factura|fono|bodega|condici[oó]n/i.test(text);
}

function isInvoiceFooter(value) {
  return /subtotal|total|iva|neto|son:|observaci[oó]n|acuse/i.test(value);
}

function Reports() {
  const { state, dispatch, notify } = useApp();
  const [report, setReport] = useState("inventory");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [printReport, setPrintReport] = useState(null);
  const [lowCategory, setLowCategory] = useState("todas");
  const [lowMode, setLowMode] = useState("controlados");

  const categoryOptions = [
    "Material Fungible",
    "Herramientas",
    "Instrumentación",
    "Maquetas Didácticas",
    ...new Set((state.materials || []).map((m) => m.category).filter(Boolean))
  ].filter((value, index, arr) => arr.indexOf(value) === index);

  const [selectedCategories, setSelectedCategories] = useState(categoryOptions);

  const lowStockAll = (state.materials || []).filter((m) =>
    isFungibleStockCategory(m) &&
    Number(m.stock || 0) < Number(m.minStock || 0)
  );

  const lowStock = lowStockAll.filter((m) => {
    const matchesCategory =
      lowCategory === "todas" || (m.category || "Sin categoría") === lowCategory;

    const matchesMode =
      lowMode === "todos" ||
      (lowMode === "controlados" && m.criticalEnabled !== false) ||
      (lowMode === "no_controlados" && m.criticalEnabled === false);

    return matchesCategory && matchesMode;
  });

  const inventory = getReportInventoryRows(state, selectedCategories);

  const loans = (state.loans || []).flatMap((l) =>
    (l.items || []).map((i) => ({
      folio: displayFolio(l, "PRE"),
      fecha: l.createdAt,
      solicitante: l.requesterName,
      item: i.name,
      cantidad: i.qty,
      estado: isOverdue(l) ? "vencido" : l.status
    }))
  );

  const data =
    report === "inventory"
      ? inventory
      : report === "loans"
        ? loans
        : lowStock;

  const columns =
    report === "inventory"
      ? [
          ["tipo", "Tipo"],
          ["nombre", "Nombre"],
          ["codigo", "Código"],
          ["stock", "Stock"],
          ["estado", "Estado"],
          ["ubicacion", "Ubicación"]
        ]
      : report === "loans"
        ? [
            ["folio", "Folio"],
            ["fecha", "Fecha"],
            ["solicitante", "Solicitante"],
            ["item", "Ítem"],
            ["cantidad", "Cantidad"],
            ["estado", "Estado"]
          ]
        : [
            ["name", "Material"],
            ["code", "Código"],
            ["category", "Categoría"],
            ["stock", "Stock"],
            ["minStock", "Mínimo"],
            ["location", "Ubicación"]
          ];

  const toggleCategory = (category) =>
    setSelectedCategories(
      selectedCategories.includes(category)
        ? selectedCategories.filter((item) => item !== category)
        : [...selectedCategories, category]
    );

  return (
    <div className="grid gap-5">
      <div className="panel print:shadow-none">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between print:hidden">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={report === "inventory" ? "primary" : "secondary"}
              onClick={() => setReport("inventory")}
            >
              <Boxes size={16} />
              Inventario
            </Button>

            <Button
              variant={report === "loans" ? "primary" : "secondary"}
              onClick={() => setReport("loans")}
            >
              <ClipboardList size={16} />
              Préstamos
            </Button>

            <Button
              variant={report === "low" ? "primary" : "secondary"}
              onClick={() => setReport("low")}
            >
              <AlertTriangle size={16} />
              Stock bajo
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setBuilderOpen(true)}>
              <FileCheck size={16} />
              Generar informe
            </Button>

            <Button
              variant="secondary"
              onClick={() => exportCSV(data, columns, `reporte-${report}.csv`)}
            >
              <Download size={16} />
              Exportar CSV
            </Button>

            <Button
              variant="secondary"
              onClick={() =>
                setPrintReport({
                  sections: { inventory: true },
                  categories: selectedCategories
                })
              }
            >
              <Printer size={16} />
              Vista impresión
            </Button>
          </div>
        </div>

        {report === "inventory" && (
          <div className="mb-5 rounded-md border border-steel-700 bg-steel-850 p-4 print:hidden">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-white">Categorías del inventario completo</h3>

              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setSelectedCategories(categoryOptions)}>
                  Todas
                </Button>

                <Button variant="secondary" onClick={() => setSelectedCategories([])}>
                  Limpiar
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((category) => (
                <label
                  key={category}
                  className="inline-flex items-center gap-2 rounded-md border border-steel-700 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => toggleCategory(category)}
                  />
                  {category}
                </label>
              ))}
            </div>
          </div>
        )}

        {report === "low" && (
          <div className="mb-5 grid gap-4 rounded-md border border-steel-700 bg-steel-850 p-4 print:hidden md:grid-cols-3">
            <Field label="Filtrar por categoría">
              <select
                className={inputClass}
                value={lowCategory}
                onChange={(e) => setLowCategory(e.target.value)}
              >
                <option value="todas">Todas las categorías</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Estado de control">
              <select
                className={inputClass}
                value={lowMode}
                onChange={(e) => setLowMode(e.target.value)}
              >
                <option value="controlados">Solo controlados</option>
                <option value="todos">Todos los bajo stock</option>
                <option value="no_controlados">No controlados / compra única</option>
              </select>
            </Field>

            <div className="rounded-lg border border-steel-700 bg-steel-900 p-3 text-sm text-slate-300">
              Mostrando{" "}
              <strong className="text-white">{lowStock.length}</strong> de{" "}
              <strong className="text-white">{lowStockAll.length}</strong>{" "}
              elemento(s) bajo mínimo.
            </div>
          </div>
        )}

        <h2 className="mb-4 text-xl font-bold text-white">
          Reporte:{" "}
          {report === "inventory"
            ? "Inventario actual"
            : report === "loans"
              ? "Préstamos por período"
              : "Stock bajo"}
        </h2>

        <DataTable
          rows={data}
          columns={columns}
          actions={
            report === "low"
              ? (row) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      className="px-2"
                      onClick={() => {
                        setReport("inventory");
                        setSelectedCategories([row.category || "Material Fungible"]);
                      }}
                    >
                      Ver
                    </Button>

                    {row.criticalEnabled === false ? (
                      <Button
                        variant="ghost"
                        className="px-2 text-emerald-700"
                        onClick={() => {
                          const material = state.materials.find((item) => item.id === row.id);
                          if (!material) return;

                          dispatch({
                            type: "UPSERT_ENTITY",
                            collection: "materials",
                            prefix: "mat",
                            row: {
                              ...material,
                              criticalEnabled: true
                            }
                          });

                          notify("Material reincorporado al stock crítico");
                        }}
                      >
                        Controlar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="px-2 text-amber-700"
                        onClick={() => {
                          const material = state.materials.find((item) => item.id === row.id);
                          if (!material) return;

                          dispatch({
                            type: "UPSERT_ENTITY",
                            collection: "materials",
                            prefix: "mat",
                            row: {
                              ...material,
                              criticalEnabled: false
                            }
                          });

                          notify("Material excluido del stock crítico");
                        }}
                      >
                        No controlar
                      </Button>
                    )}
                  </div>
                )
              : undefined
          }
        />
      </div>

      {builderOpen && (
        <ReportBuilderModal
          categories={categoryOptions}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
          onClose={() => setBuilderOpen(false)}
          onGenerate={(sections) => {
            setPrintReport({ sections, categories: selectedCategories });
            setBuilderOpen(false);
          }}
        />
      )}

      {printReport && (
        <PrintableReportModal
          state={state}
          report={printReport}
          onClose={() => setPrintReport(null)}
        />
      )}
    </div>
  );
}
function getReportInventoryRows(state, selectedCategories) {
  const includeTools = selectedCategories.includes("Herramientas");
  const materialRows = state.materials
    .filter((m) => selectedCategories.includes(m.category))
    .map((m) => ({ tipo: m.category || "Material", nombre: m.name, codigo: m.code, stock: m.stock, estado: `${m.stock} ${m.unit}`, ubicacion: m.location }));
  const toolRows = includeTools ? state.tools.map((t) => ({ tipo: "Herramientas", nombre: t.name, codigo: t.code, stock: 1, estado: t.status, ubicacion: "Pañol herramientas" })) : [];
  return [...materialRows, ...toolRows];
}

function ReportBuilderModal({ categories, selectedCategories, setSelectedCategories, onClose, onGenerate }) {
  const [sections, setSections] = useState({ monthLoans: true, lowStock: true, latest: false, ranking: false, summary: true, inventory: true });
  const toggleSection = (key) => setSections({ ...sections, [key]: !sections[key] });
  const toggleCategory = (category) => setSelectedCategories(selectedCategories.includes(category) ? selectedCategories.filter((item) => item !== category) : [...selectedCategories, category]);
  return (
    <Modal title="Selecciona las secciones del informe" onClose={onClose}>
      <div className="grid gap-5">
        <div className="grid gap-2">
          {[["monthLoans", "Incluir solicitudes del mes actual"], ["lowStock", "Incluir materiales en stock crítico"], ["latest", "Incluir últimos materiales ingresados"], ["ranking", "Incluir ranking de materiales más solicitados"], ["summary", "Incluir resumen por categoría"], ["inventory", "Incluir inventario completo"]].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={sections[key]} onChange={() => toggleSection(key)} />{label}</label>)}
        </div>
        <div className="rounded-md border border-steel-700 bg-steel-850 p-3">
          <p className="mb-2 font-semibold text-white">Categorías para inventario completo</p>
          <div className="flex flex-wrap gap-2">{categories.map((category) => <label key={category} className="inline-flex items-center gap-2 rounded-md border border-steel-700 px-3 py-2 text-sm"><input type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggleCategory(category)} />{category}</label>)}</div>
        </div>
        <Button onClick={() => onGenerate(sections)}><FileCheck size={16} />Generar informe</Button>
      </div>
    </Modal>
  );
}

function PrintableReportModal({ state, report, onClose }) {
  const inventory = getReportInventoryRows(state, report.categories);
  const lowStock = state.materials.filter((m) => isCriticalStockItem(m));
  const month = new Date().getMonth();
  const monthLoans = state.loans.filter((loan) => new Date(`${loan.createdAt}T12:00:00`).getMonth() === month).flatMap((loan) => loan.items.map((item) => ({ folio: displayFolio(loan, "PRE"), fecha: loan.createdAt, responsable: loan.requesterName, material: item.name, cantidad: item.qty, estado: loan.status })));
  const ranking = Object.values(state.loans.flatMap((loan) => loan.items).reduce((acc, item) => {
    acc[item.name] = acc[item.name] || { material: item.name, cantidad: 0 };
    acc[item.name].cantidad += Number(item.qty);
    return acc;
  }, {})).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
  const summary = report.categories.map((category) => ({ categoria: category, total: inventory.filter((item) => item.tipo === category).length, critico: lowStock.filter((item) => (item.category || "Material") === category).length }));
  return (
    <Modal title="Vista de informe" onClose={onClose} wide>
      <div className="report-page">
        <ReportHeader title="Informe Personalizado de Inventario" />
        {report.sections.monthLoans && <ReportSection title="Solicitudes del Mes Actual"><ReportPlainTable rows={monthLoans} columns={[["folio", "Folio"], ["fecha", "Fecha"], ["responsable", "Responsable"], ["material", "Material"], ["cantidad", "Cantidad"], ["estado", "Estado"]]} /></ReportSection>}
        {report.sections.lowStock && <ReportSection title="Materiales en Stock Crítico"><ReportPlainTable rows={lowStock} columns={[["name", "Material"], ["code", "Código"], ["stock", "Stock"], ["minStock", "Mínimo"]]} /></ReportSection>}
        {report.sections.ranking && <ReportSection title="Ranking de Materiales Más Solicitados"><ReportPlainTable rows={ranking} columns={[["material", "Material"], ["cantidad", "Cantidad solicitada"]]} /></ReportSection>}
        {report.sections.summary && <ReportSection title="Resumen por Categoría"><ReportPlainTable rows={summary} columns={[["categoria", "Categoría"], ["total", "Total"], ["critico", "Stock crítico"]]} /></ReportSection>}
        {report.sections.inventory && <ReportSection title="Inventario Completo"><ReportPlainTable rows={inventory} columns={[["tipo", "Categoría"], ["nombre", "Nombre"], ["codigo", "Código"], ["stock", "Stock"], ["estado", "Estado"], ["ubicacion", "Ubicación"]]} /></ReportSection>}
      </div>
      <div className="mt-5 flex justify-end gap-2 print:hidden"><Button variant="secondary" onClick={onClose}>Cerrar</Button><Button onClick={() => window.print()}><Printer size={16} />Imprimir</Button></div>
    </Modal>
  );
}

function ReportHeader({ title }) {
  return <div className="report-header"><div className="report-badge">S</div><div><p>COLEGIO SALESIANO CONCEPCIÓN</p><h1>{title}</h1><span>{formatDate(today())}</span></div></div>;
}

function ReportSection({ title, children }) {
  return <section className="report-section"><h2>{title}</h2>{children}</section>;
}

function ReportPlainTable({ rows, columns }) {
  return <table className="report-table"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, ix) => <tr key={ix}>{columns.map(([key]) => <td key={key}>{renderCell(row, key)}</td>)}</tr>) : <tr><td colSpan={columns.length}>Sin registros</td></tr>}</tbody></table>;
}

function WorkshopReservations({ currentUser }) {
  const { state, dispatch, notify } = useApp();
  const isTeacher = currentUser?.role === "docente";
  const teacher = isTeacher ? getTeacherForAppUser(state, currentUser) : null;
  const hasWorkshopAccess = userHasWorkshopAccess(state, currentUser);
  const rooms = (state.workshopRooms?.length ? state.workshopRooms : defaultWorkshopRooms).filter((room) => room.active !== false);
  const reservations = state.workshopReservations || [];
  const [tab, setTab] = useState("new");
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState([]);
  const [course, setCourse] = useState("");
  const [activity, setActivity] = useState("");
  const [resource, setResource] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [calendarDate, setCalendarDate] = useState(today());
  const room = rooms.find((item) => item.id === roomId) || rooms[0];
  const teacherOptions = useMemo(() => {
    const fromProfiles = getAppUsers(state)
      .filter((user) => user.active !== false && userHasWorkshopAccess(state, user))
      .map((user) => getTeacherForAppUser(state, user));
    const merged = new Map();
    [...(state.teachers || []), ...fromProfiles].forEach((person) => merged.set(person.id || person.email || person.name, person));
    return [...merged.values()];
  }, [state.appUsers, state.teachers]);
  const selectedTeacher = isTeacher ? teacher : teacherOptions.find((person) => person.id === teacherId) || teacherOptions[0];
  const visibleReservations = [...(isTeacher ? reservations.filter((reservation) => reservation.teacherId === teacher.id || normalizeHeader(reservation.teacherEmail || "") === normalizeHeader(teacher.email || "") || normalizeHeader(reservation.teacherName || "") === normalizeHeader(teacher.name)) : reservations)]
    .sort((a, b) => `${b.date} ${b.createdAt}`.localeCompare(`${a.date} ${a.createdAt}`));
  const upcomingReservations = reservations
    .filter((reservation) => reservation.status !== "cancelada" && reservation.date >= today())
    .sort((a, b) => `${a.date} ${asArray(a.slots)[0] || ""}`.localeCompare(`${b.date} ${asArray(b.slots)[0] || ""}`));
  const calendarReservations = reservations.filter((reservation) => reservation.status !== "cancelada" && reservation.date === calendarDate);
  const conflicts = reservations.filter((reservation) => (
    reservation.status !== "cancelada" &&
    reservation.date === date &&
    reservation.roomId === room?.id &&
    asArray(reservation.slots).some((slot) => slots.includes(slot))
  ));
  const toggleSlot = (slot) => setSlots(slots.includes(slot) ? slots.filter((item) => item !== slot) : [...slots, slot]);
  const createReservation = () => {
    if (!room || !selectedTeacher || !date || !slots.length || !course.trim() || !activity.trim()) return notify("Completa sala, fecha, bloque, curso y actividad", "error");
    if (conflicts.length) return notify("Ese bloque ya está reservado para la sala seleccionada", "error");
    dispatch({
      type: "CREATE_WORKSHOP_RESERVATION",
      reservation: {
        roomId: room.id,
        roomName: room.name,
        date,
        slots: [...slots].sort(),
        course: course.trim(),
        teacherId: selectedTeacher.id,
        teacherName: selectedTeacher.name,
        teacherEmail: selectedTeacher.email || "",
        activity: activity.trim(),
        resource: resource.trim()
      }
    });
    notify("Reserva de taller registrada");
    setSlots([]);
    setCourse("");
    setActivity("");
    setResource("");
    setTab("mine");
  };
  const addRoom = () => {
    if (!newRoomName.trim()) return;
    dispatch({ type: "UPSERT_WORKSHOP_ROOM", row: { name: newRoomName.trim(), active: true } });
    notify("Sala agregada");
    setNewRoomName("");
  };
  if (isTeacher && !hasWorkshopAccess) return <EmptyState text="Tu perfil todavia no tiene habilitadas las reservas del taller." />;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        {[["new", CalendarDays, "Nueva reserva"], ["mine", History, isTeacher ? "Mis reservas" : "Reservas"], ["calendar", ClipboardList, "Calendario"]].map(([id, Icon, label]) => (
          <Button key={id} variant={tab === id ? "primary" : "secondary"} onClick={() => setTab(id)}><Icon size={16} />{label}</Button>
        ))}
      </div>
      {tab === "new" && (
        <section className="panel grid gap-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Sala de taller">
              <select className={inputClass} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            {!isTeacher && (
              <Field label="Profesor responsable">
                <select className={inputClass} value={selectedTeacher?.id || ""} onChange={(e) => setTeacherId(e.target.value)}>
                  {teacherOptions.map((person) => <option key={person.id || person.email || person.name} value={person.id}>{person.name}{person.email ? ` · ${person.email}` : ""}</option>)}
                </select>
              </Field>
            )}
            <Field label="Fecha de la actividad">
              <input className={`${inputClass} cursor-pointer`} type="date" value={date} onClick={(e) => e.currentTarget.showPicker?.()} onFocus={(e) => e.currentTarget.showPicker?.()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Curso o grupo">
              <input className={inputClass} value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Ej: 4° Medio A grupo 1" />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-200">Bloques horarios</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {defaultWorkshopSlots.map((slot) => (
                <button key={slot} type="button" onClick={() => toggleSlot(slot)} className={`rounded-md border px-3 py-2 text-left text-sm font-semibold transition ${slots.includes(slot) ? "border-safety-500 bg-safety-500 text-steel-950" : "border-steel-700 bg-steel-850 text-slate-200 hover:border-safety-500"}`}>
                  {slot}
                </button>
              ))}
            </div>
            {conflicts.length > 0 && (
              <div className="mt-3 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-100">
                Ya existe reserva: {conflicts.map((item) => `${item.teacherName} · ${asArray(item.slots).join(", ")}`).join(" / ")}
              </div>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Actividad">
              <textarea className={`${inputClass} min-h-24 resize-y`} value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Describe la actividad del taller" />
            </Field>
            <Field label="Recurso / observación">
              <textarea className={`${inputClass} min-h-24 resize-y`} value={resource} onChange={(e) => setResource(e.target.value)} placeholder="Equipo, sala, herramientas o comentario adicional" />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button onClick={createReservation}><CalendarDays size={16} />Registrar reserva</Button>
          </div>
        </section>
      )}
      {tab === "mine" && (
        <section className="panel grid gap-3">
          <h2 className="section-title"><History size={18} />{isTeacher ? "Mis reservas anteriores" : "Reservas registradas"}</h2>
          {visibleReservations.length === 0 && <p className="rounded-md border border-steel-700 bg-steel-850 p-4 text-sm text-slate-400">Sin reservas registradas.</p>}
          {visibleReservations.map((reservation) => (
            <div key={reservation.id} className={`rounded-md border p-4 ${reservation.status === "cancelada" ? "border-red-500/40 bg-red-500/10" : "border-steel-700 bg-steel-850"}`}>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-bold text-white">{reservation.folio || displayFolio(reservation, "TAL")} · {reservation.roomName}</p>
                  <p className="text-sm text-slate-300">{formatDate(reservation.date)} · {asArray(reservation.slots).join(", ")} · {reservation.course}</p>
                  <p className="mt-2 text-sm text-slate-200">{reservation.activity}</p>
                  {reservation.resource && <p className="mt-1 text-xs text-slate-400">{reservation.resource}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={reservation.status === "cancelada" ? "red" : "green"}>{reservation.status}</Badge>
                  {!isTeacher && <Badge tone="blue">{reservation.teacherName}</Badge>}
                  {reservation.status !== "cancelada" && <Button variant="secondary" onClick={() => { dispatch({ type: "CANCEL_WORKSHOP_RESERVATION", id: reservation.id, reason: "Cancelada desde sistema" }); notify("Reserva cancelada"); }}>Cancelar</Button>}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
      {tab === "calendar" && (
        <section className="panel grid gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="section-title"><ClipboardList size={18} />Calendario de taller</h2>
              <p className="text-sm text-slate-400">Selecciona un día para revisar disponibilidad por sala y bloque.</p>
            </div>
            {!isTeacher && (
              <div className="grid gap-2 sm:grid-cols-[220px_auto]">
                <input className={inputClass} value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="Nueva sala" />
                <Button variant="secondary" onClick={addRoom}><Plus size={16} />Agregar sala</Button>
              </div>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
            <Field label="Día del calendario">
              <input className={`${inputClass} cursor-pointer`} type="date" value={calendarDate} onClick={(e) => e.currentTarget.showPicker?.()} onFocus={(e) => e.currentTarget.showPicker?.()} onChange={(e) => setCalendarDate(e.target.value)} />
            </Field>
            <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-slate-200">
              {calendarReservations.length ? `${calendarReservations.length} reserva(s) activa(s) para ${formatDate(calendarDate)}.` : `No hay reservas activas para ${formatDate(calendarDate)}.`}
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {rooms.map((item) => {
              const roomReservations = calendarReservations.filter((reservation) => reservation.roomId === item.id || reservation.roomName === item.name);
              return (
                <div key={item.id} className="rounded-lg border border-steel-700 bg-steel-850 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="font-bold text-white">{item.name}</h3>
                    <Badge tone={roomReservations.length ? "amber" : "green"}>{roomReservations.length ? `${roomReservations.length} reserva(s)` : "Disponible"}</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {defaultWorkshopSlots.map((slot) => {
                      const reservation = roomReservations.find((entry) => asArray(entry.slots).includes(slot));
                      return (
                        <div key={slot} className={`rounded-md border p-3 ${reservation ? "border-red-500/50 bg-red-500/10" : "border-emerald-500/40 bg-emerald-500/10"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-white">{slot}</span>
                            <Badge tone={reservation ? "red" : "green"}>{reservation ? "Reservado" : "Libre"}</Badge>
                          </div>
                          {reservation ? (
                            <div className="mt-2 text-xs text-slate-300">
                              <p className="font-semibold text-white">{reservation.teacherName}</p>
                              <p>{reservation.course}</p>
                              <p>{reservation.activity}</p>
                            </div>
                          ) : <p className="mt-2 text-xs text-slate-400">Sin uso registrado.</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <DataTable
            rows={upcomingReservations.map((reservation) => ({ ...reservation, folioText: reservation.folio || displayFolio(reservation, "TAL"), fechaTexto: formatDate(reservation.date), slotsText: asArray(reservation.slots).join(", ") }))}
            columns={[["folioText", "Folio"], ["fechaTexto", "Fecha"], ["slotsText", "Bloque"], ["roomName", "Sala"], ["teacherName", "Profesor"], ["course", "Curso"], ["activity", "Actividad"]]}
            compact
          />
        </section>
      )}
    </div>
  );
}

function SettingsPage() {
  const { state, dispatch, notify, cloudStatus } = useApp();
  const isLight = state.settings.theme === "light";
  return (
    <div className="panel">
      <h2 className="section-title"><Settings size={18} />Parámetros del pañol</h2>
      <div className="mb-4 rounded-md border border-steel-700 bg-steel-850 p-3 text-sm text-slate-300">Estado de sincronización: <span className="font-semibold text-white">{cloudStatus}</span></div>
      <Field label="Umbral general de stock crítico"><input className={inputClass} type="number" min="1" value={state.settings.criticalThreshold} onChange={(e) => dispatch({ type: "SET_SETTING", key: "criticalThreshold", value: Number(e.target.value) })} /></Field>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Responsable activo"><input className={inputClass} value={state.settings.operatorName || ""} onChange={(e) => dispatch({ type: "SET_SETTING", key: "operatorName", value: e.target.value })} /></Field>
        <Field label="Rol de usuario"><select className={inputClass} value={state.settings.operatorRole || "pañolero"} onChange={(e) => dispatch({ type: "SET_SETTING", key: "operatorRole", value: e.target.value })}><option value="administrador">Administrador</option><option value="pañolero">Pañolero</option><option value="profesor">Profesor consultor</option><option value="lectura">Solo lectura</option></select></Field>
      </div>
      <div className="mt-6 rounded-md border border-steel-700 bg-steel-850 p-4">
        <h3 className="section-title"><ShieldCheck size={18} />Reglas operativas</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Avisar préstamos por vencer en"><input className={inputClass} type="number" min="1" value={state.settings.loanDueSoonDays ?? 2} onChange={(e) => dispatch({ type: "SET_SETTING", key: "loanDueSoonDays", value: Number(e.target.value) })} /></Field>
          <Field label="Días por defecto para devolución"><input className={inputClass} type="number" min="0" value={state.settings.defaultReturnDays ?? 0} onChange={(e) => dispatch({ type: "SET_SETTING", key: "defaultReturnDays", value: Number(e.target.value) })} /></Field>
          <Field label="Recordatorio docente al entrar"><select className={inputClass} value={state.settings.teacherReturnReminder ?? "activo"} onChange={(e) => dispatch({ type: "SET_SETTING", key: "teacherReturnReminder", value: e.target.value })}><option value="activo">Activo</option><option value="apagado">Apagado</option></select></Field>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={Boolean(state.settings.defaultFungibleNonReturnable)} onChange={(e) => dispatch({ type: "SET_SETTING", key: "defaultFungibleNonReturnable", value: e.target.checked })} />Material fungible sale como "no vuelve" por defecto</label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={state.settings.showAdminAlertStrip !== false} onChange={(e) => dispatch({ type: "SET_SETTING", key: "showAdminAlertStrip", value: e.target.checked })} />Mostrar franja de alertas en la portada</label>
        </div>
      </div>
      <div className="mt-4">
        <Field label="Tema visual">
          <div className="flex gap-2">
            <Button variant={!isLight ? "primary" : "secondary"} onClick={() => dispatch({ type: "SET_SETTING", key: "theme", value: "dark" })}><Moon size={16} />Oscuro</Button>
            <Button variant={isLight ? "primary" : "secondary"} onClick={() => dispatch({ type: "SET_SETTING", key: "theme", value: "light" })}><Sun size={16} />Claro</Button>
          </div>
        </Field>
      </div>
      <div className="mt-6 border-t border-steel-700 pt-5">
        <ProfileManager />
      </div>
      <div className="mt-6 border-t border-steel-700 pt-5">
        <BackupAuditPanel />
      </div>
      <div className="mt-5 flex gap-2"><Button onClick={() => notify("Configuración guardada")}><Save size={16} />Guardar ajustes</Button><Button variant="secondary" onClick={() => { dispatch({ type: "RESET_DATA" }); notify("Datos del sistema vaciados"); }}><RotateCcw size={16} />Vaciar datos</Button></div>
    </div>
  );
}

function BackupAuditPanel() {
  const { state, dispatch, notify } = useApp();
  const [saving, setSaving] = useState(false);
  const createBackup = async () => {
    const label = `backup-${today()}-${new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }).replace(":", "")}`;
    const snapshot = { ...state, exportedAt: new Date().toISOString() };
    setSaving(true);
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("app_backups").insert({ label, data: snapshot });
      if (error) {
        console.error("Error creando respaldo", error);
        notify("No se pudo guardar respaldo en Supabase. Se descargará localmente.", "error");
      }
    }
    dispatch({ type: "REGISTER_BACKUP", backup: { id: uid("bak"), label, date: today(), time: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) } });
    downloadJSON(snapshot, `${label}.json`);
    setSaving(false);
    notify("Respaldo generado");
  };
  const exportAudit = () => {
    downloadJSON(state.auditLog || [], `auditoria-panol-${today()}.json`);
    notify("Auditoría exportada");
  };
  return (
    <div className="grid gap-5">
      <h2 className="section-title"><Database size={18} />Respaldos y auditoría</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Eventos auditados</p><p className="text-2xl font-bold text-white">{(state.auditLog || []).length}</p></div>
        <div className="rounded-md border border-steel-700 bg-steel-850 p-3"><p className="text-sm text-slate-400">Respaldos creados</p><p className="text-2xl font-bold text-white">{(state.backups || []).length}</p></div>
        <div className="flex flex-wrap items-end gap-2"><Button onClick={createBackup} disabled={saving}><Download size={16} />Crear respaldo</Button><Button variant="secondary" onClick={exportAudit}><FileText size={16} />Exportar auditoría</Button></div>
      </div>
      <DataTable rows={(state.auditLog || []).slice(0, 20)} columns={[["date", "Fecha"], ["time", "Hora"], ["actor", "Usuario"], ["detail", "Acción"]]} compact />
    </div>
  );
}

function ProfileManager() {
  const { state, dispatch, notify } = useApp();
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", role: "usuario", permissions: ["dashboard"] });
  const users = getAppUsers(state);
  const togglePermission = (permission) => {
    setForm({ ...form, permissions: form.permissions.includes(permission) ? form.permissions.filter((item) => item !== permission) : [...form.permissions, permission] });
  };
  const save = () => {
    if (!form.name || !form.username || (!isSupabaseConfigured && !form.id && !form.password) || !form.permissions.length) return notify("Completa nombre, usuario, clave y permisos", "error");
    if (normalizeHeader(form.username) === "panol" && form.id !== "admin-panol") return notify("El usuario panol está reservado para administración", "error");
    dispatch({ type: "UPSERT_APP_USER", row: { ...form, active: form.active ?? true } });
    notify("Perfil guardado");
    setForm({ name: "", username: "", email: "", password: "", role: "usuario", permissions: ["dashboard"] });
  };
  const edit = (user) => setForm({ ...user, password: user.password || "" });
  return (
    <div className="grid gap-5">
      <h2 className="section-title"><KeyRound size={18} />Perfiles y permisos de acceso</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre del perfil/persona"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Usuario"><input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={form.username === "panol"} /></Field>
        <Field label="Email Supabase Auth"><input className={inputClass} type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo usado en Authentication" /></Field>
        <Field label={isSupabaseConfigured ? "Clave local (emergencia)" : "Clave"}><input className={inputClass} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Rol"><select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="administrador">Administrador</option><option value="pañolero">Pañolero</option><option value="docente">Docente</option><option value="lectura">Solo lectura</option><option value="usuario">Usuario personalizado</option></select></Field>
      </div>
      <div className="rounded-md border border-steel-700 bg-steel-850 p-3">
        <p className="mb-2 font-semibold text-white">Puede acceder a:</p>
        <div className="grid gap-2 md:grid-cols-2">
          {permissionOptions.map(([key, label]) => <label key={key} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.permissions.includes(key)} onChange={() => togglePermission(key)} disabled={form.username === "panol"} />{label}</label>)}
        </div>
      </div>
      <div className="rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-200">Para Auth real, crea primero el usuario en Supabase Authentication con ese email. Luego guarda este perfil para asignar permisos dentro del sistema.</div>
      <div className="flex gap-2"><Button onClick={save}><Save size={16} />Guardar perfil</Button><Button variant="secondary" onClick={() => setForm({ name: "", username: "", email: "", password: "", role: "usuario", permissions: ["dashboard"] })}>Nuevo</Button></div>
      <DataTable rows={users.map((user) => ({ ...user, permissionText: user.permissions?.map((key) => permissionOptions.find(([id]) => id === key)?.[1] || key).join(", "), status: user.active ? "activo" : "inactivo" }))} columns={[["name", "Nombre"], ["username", "Usuario"], ["email", "Email"], ["role", "Rol"], ["status", "Estado"], ["permissionText", "Permisos"]]} actions={(row) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" className="px-2" onClick={() => edit(row)}><Edit3 size={16} /></Button>
          {row.username !== "panol" && <Button variant="ghost" className="px-2" onClick={() => { dispatch({ type: "UPSERT_APP_USER", row: { ...row, active: !row.active } }); notify(row.active ? "Perfil desactivado" : "Perfil activado"); }}>{row.active ? "Desactivar" : "Activar"}</Button>}
          {row.username !== "panol" && <Button variant="ghost" className="px-2 text-red-300" onClick={() => { dispatch({ type: "DELETE_APP_USER", id: row.id }); notify("Perfil eliminado"); }}><Trash2 size={16} /></Button>}
        </div>
      )} compact />
    </div>
  );
}

function DataTable({ rows, columns, actions, compact = false }) {
  return (
    <div className="overflow-hidden rounded-lg border border-steel-700">
      <table className="responsive-table min-w-full divide-y divide-steel-700 text-sm">
        <thead className="bg-steel-800 text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>{columns.map(([, label]) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}{actions && <th className="px-4 py-3 text-right">Acciones</th>}</tr>
        </thead>
        <tbody className="divide-y divide-steel-800 bg-steel-900">
          {rows.length === 0 && <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-8 text-center text-slate-400">Sin registros para mostrar</td></tr>}
          {rows.map((row, ix) => <tr key={row.id || ix} className="hover:bg-steel-850">{columns.map(([key, label]) => <td key={key} data-label={label} className={`px-4 ${compact ? "py-2" : "py-3"} text-slate-200`}>{renderCell(row, key)}</td>)}{actions && <td data-label="Acciones" className="px-4 py-2 text-right">{actions(row)}</td>}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(row, key) {
  const value = row[key];
  if (key === "photoPreview") return <StudentPhotoAvatar person={row} size="xs" />;
  if (key.toLowerCase().includes("date") || key === "fecha") return value ? formatDate(value) : "";
  if (key === "status" || key === "estado") {
    const tone = String(value).includes("vencido") || String(value).includes("reparación") ? "red" : String(value).includes("activo") || String(value).includes("préstamo") ? "amber" : "green";
    return <Badge tone={tone}>{value}</Badge>;
  }
  return value;
}

function Pager({ page, pages, setPage }) {
  return <div className="mt-4 flex items-center justify-end gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></Button><span className="text-sm text-slate-400">Página {page} de {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></Button></div>;
}

function exportCSV(rows, columns, filename) {
  const header = columns.map(([, label]) => label).join(",");
  const body = rows.map((row) => columns.map(([key]) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  return <AppProvider><AuthenticatedApp /></AppProvider>;
}

function AuthenticatedApp() {
  const { state, notify } = useApp();
  const [section, setSection] = useState("dashboard");
  const [sessionId, setSessionId] = useState(() => sessionStorage.getItem(APP_SESSION_KEY) || "");
  const [authSession, setAuthSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const users = getAppUsers(state);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthSession(data.session || null);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session || null);
      setAuthLoading(false);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const authEmail = authSession?.user?.email || "";
  const normalizedAuthEmail = normalizeHeader(authEmail);
  const authUsername = normalizeHeader(authEmail.split("@")[0] || "");
  const rawUser = isSupabaseConfigured
    ? authSession && normalizedAuthEmail
      ? users.find((user) => {
        const profileEmail = normalizeHeader(user.email || "");
        const profileUsername = normalizeHeader(user.username || "");
        return user.active && (
          (profileEmail && profileEmail === normalizedAuthEmail) ||
          (profileUsername && profileUsername === normalizedAuthEmail) ||
          (profileUsername && profileUsername === authUsername)
        );
      })
      : null
    : users.find((user) => user.id === sessionId && user.active);
  const currentUser = rawUser?.id === "admin-panol" ? { ...rawUser, permissions: allPermissions } : rawUser;
  const login = async (username, password) => {
    if (isSupabaseConfigured && supabase) {
      const email = username.includes("@") ? username : users.find((user) => normalizeHeader(user.username) === normalizeHeader(username))?.email;
      if (!email) {
        notify("Ingresa el email de Supabase Auth o configura el email en el perfil", "error");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        notify("Usuario o clave incorrecta en Supabase Auth", "error");
        return;
      }
      setSection(users.find((user) => normalizeHeader(user.email || "") === normalizeHeader(email))?.permissions?.[0] || "dashboard");
      return;
    }
    if (normalizeHeader(username) === "panol" && password === "panol2026") {
      sessionStorage.setItem(APP_SESSION_KEY, "admin-panol");
      setSessionId("admin-panol");
      setSection("dashboard");
      return;
    }
    const user = users.find((item) => item.active && normalizeHeader(item.username) === normalizeHeader(username) && item.password === password);
    if (!user) {
      notify("Usuario o clave incorrecta", "error");
      return;
    }
    sessionStorage.setItem(APP_SESSION_KEY, user.id);
    setSessionId(user.id);
    setSection(user.permissions?.[0] || "dashboard");
  };
  const logout = async () => {
    clearAuthStorage();
    setSessionId("");
    setAuthSession(null);
    setSection("dashboard");
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) console.error("Error cerrando sesión Supabase", error);
    }
    clearAuthStorage();
    window.location.replace(window.location.pathname);
  };
  if (authLoading) return <div className="grid min-h-screen place-items-center bg-steel-950 text-slate-100">Conectando sesión segura...</div>;
  if (isSupabaseConfigured && authSession && !currentUser) return <MissingProfile email={authEmail} onLogout={logout} />;
  if (!currentUser) return <MainLogin onLogin={login} />;
  if (currentUser.role === "docente") return <TeacherWorkspace currentUser={currentUser} onLogout={logout} />;
  return <Layout section={section} setSection={setSection} currentUser={currentUser} onLogout={logout} />;
}

function MainLogin({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    await onLogin(username, password);
    setLoading(false);
  };
  return (
    <div className="grid min-h-screen place-items-center bg-steel-950 p-4 text-slate-100">
      <div className="panel w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-md border border-safety-500/50 bg-white p-1 shadow-sm"><img src="/logo-salesiano.png" alt="Colegio Salesiano" className="h-full w-full object-contain" /></div>
          <div>
            <h1 className="text-xl font-bold text-white">PAÑOL CENTRAL</h1>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Colegio Salesiano</p>
          </div>
        </div>
        <div className="grid gap-4">
          <Field label={isSupabaseConfigured ? "Email o usuario" : "Usuario"}><input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></Field>
          <Field label="Clave"><input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={(e) => { if (e.key === "Enter") submit(); }} /></Field>
          {isSupabaseConfigured && <p className="text-sm text-slate-400">Ingreso protegido por Supabase Auth.</p>}
          <Button onClick={submit} disabled={loading}><KeyRound size={16} />{loading ? "Validando..." : "Ingresar"}</Button>
        </div>
      </div>
    </div>
  );
}

function MissingProfile({ email, onLogout }) {
  return (
    <div className="grid min-h-screen place-items-center bg-steel-950 p-4 text-slate-100">
      <div className="panel max-w-lg">
        <h1 className="mb-3 text-xl font-bold text-white">Usuario sin perfil interno</h1>
        <p className="text-slate-300">La cuenta <strong>{email}</strong> existe en Supabase Auth, pero todavía no tiene permisos asignados en el pañol.</p>
        <p className="mt-2 text-sm text-slate-400">Entra con un administrador, ve a Ajustes, crea/edita un perfil y coloca este mismo email en “Email Supabase Auth”.</p>
        <div className="mt-5"><Button variant="secondary" onClick={onLogout}><LogOut size={16} />Salir</Button></div>
      </div>
    </div>
  );
}

function buildLocalTeacherSuggestions({ teacher, inventory, requests, cart }) {
  const cartKeys = new Set(cart.map((item) => `${item.type}-${item.id}`));
  const available = inventory.filter((item) => Number(item.stock) > 0);
  const historyCounts = new Map();
  requests.forEach((request) => {
    request.items?.forEach((item) => {
      const key = `${item.type}-${item.id}`;
      historyCounts.set(key, (historyCounts.get(key) || 0) + Number(item.qty || 1));
    });
  });
  const fromHistory = available
    .map((item) => ({ ...item, score: historyCounts.get(`${item.type}-${item.id}`) || 0 }))
    .filter((item) => item.score > 0 && !cartKeys.has(`${item.type}-${item.id}`))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const departmentWords = normalizeHeader(teacher.department || teacher.name || "").split(" ").filter((word) => word.length > 3);
  const byDepartment = available
    .map((item) => {
      const haystack = normalizeHeader(`${item.name} ${item.category || ""} ${item.description || ""}`);
      const score = departmentWords.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
      return { ...item, score };
    })
    .filter((item) => item.score > 0 && !cartKeys.has(`${item.type}-${item.id}`))
    .sort((a, b) => b.score - a.score || Number(b.stock) - Number(a.stock))
    .slice(0, 4);
  const popular = available
    .map((item) => ({ ...item, score: statefulNameScore(item.name, requests) }))
    .filter((item) => !cartKeys.has(`${item.type}-${item.id}`))
    .sort((a, b) => b.score - a.score || Number(b.stock) - Number(a.stock))
    .slice(0, 4);
  const sections = [];
  if (fromHistory.length) sections.push({ id: "historial", title: "Basado en tus solicitudes", reason: "Estos ítems aparecen en solicitudes anteriores de este perfil.", items: fromHistory });
  if (byDepartment.length) sections.push({ id: "area", title: `Sugerido para ${teacher.department || "tu área"}`, reason: "Coincide con el departamento o especialidad del docente.", items: byDepartment });
  const popularItems = popular.filter((item) => !sections.flatMap((section) => section.items).some((existing) => existing.id === item.id && existing.type === item.type));
  if (popularItems.length) sections.push({ id: "popular", title: "Disponibles y solicitados", reason: "Materiales con uso recurrente y stock disponible.", items: popularItems.slice(0, 4) });
  return sections.slice(0, 3);
}

function parseStudentCount(prompt = "") {
  const match = String(prompt).match(/(\d{1,3})\s*(alumnos|estudiantes|personas)?/i);
  return Math.max(1, Math.min(80, Number(match?.[1]) || 30));
}

function findLessonInventoryItem(available, keywords, usedKeys) {
  const words = Array.isArray(keywords) ? keywords : [keywords];
  return available
    .map((item) => {
      const haystack = normalizeHeader(`${item.name} ${item.code || ""} ${item.category || ""} ${item.description || ""}`);
      const score = words.reduce((total, word) => total + (haystack.includes(normalizeHeader(word)) ? 1 : 0), 0);
      return { ...item, lessonScore: score };
    })
    .filter((item) => item.lessonScore > 0 && !usedKeys.has(`${item.type}-${item.id}`))
    .sort((a, b) => b.lessonScore - a.lessonScore || Number(b.stock) - Number(a.stock))[0];
}

function buildLocalLessonPlan({ prompt, rubricText = "", teacher, inventory }) {
  const combinedPrompt = `${prompt}\n${rubricText}`.slice(0, 6000);
  const normalizedPrompt = normalizeHeader(combinedPrompt);
  const students = parseStudentCount(prompt);
  const available = inventory.filter((item) => Number(item.stock) > 0);
  const usedKeys = new Set();
  const items = [];
  const addMatch = (keywords, qtyRule) => {
    const item = findLessonInventoryItem(available, keywords, usedKeys);
    if (!item) return;
    const stock = Number(item.stock) || 1;
    const desiredQty = typeof qtyRule === "function" ? qtyRule({ students, item, stock }) : qtyRule;
    const qty = Math.max(1, Math.min(stock, Number(desiredQty) || 1));
    usedKeys.add(`${item.type}-${item.id}`);
    items.push({ ...item, qty });
  };

  const isElectric = /circuit|electric|electron|serie|paralelo|voltaje|corriente|resistencia|led/.test(normalizedPrompt);
  const isArduino = /arduino|program|robot|sensor|wifi|esp/.test(normalizedPrompt);
  const isMeasurement = /medic|tester|multimetro|voltimetro|amperimetro/.test(normalizedPrompt);
  const isWorkshop = /seguridad|epp|taller|herramient|mecan|maqueta|constru/.test(normalizedPrompt);
  const isHomeInstallation = /instalacion domiciliaria|domiciliaria|canaleta|enchufe|interruptor|alumbrado|tablero|empalme|conductor|fase|neutro|tierra|caja derivacion|caja chuqui|caja electrica/.test(normalizedPrompt);

  if (isHomeInstallation) {
    addMatch(["cable", "alambre", "conductor", "thhn", "nylon"], ({ students }) => students * 3);
    addMatch(["canaleta"], ({ students }) => Math.ceil(students / 2));
    addMatch(["interruptor"], ({ students }) => Math.ceil(students / 2));
    addMatch(["enchufe", "tomacorriente"], ({ students }) => Math.ceil(students / 2));
    addMatch(["caja", "derivacion", "chuqui"], ({ students }) => Math.ceil(students / 2));
    addMatch(["huincha", "metro"], ({ stock }) => Math.min(3, stock));
    addMatch(["destornillador"], ({ stock }) => Math.min(3, stock));
    addMatch(["alicate"], ({ stock }) => Math.min(3, stock));
    addMatch(["cinta aislante"], ({ students }) => Math.ceil(students / 3));
  }
  if (isArduino) {
    addMatch(["arduino", "uno"], ({ students, stock }) => Math.min(Math.ceil(students / 4), stock));
    addMatch(["protoboard", "breadboard"], ({ students }) => Math.ceil(students / 2));
    addMatch(["cable", "jumper", "dupont"], ({ students }) => students * 3);
    addMatch(["led"], ({ students }) => students);
    addMatch(["resistencia", "ohm"], ({ students }) => students * 2);
  }
  if (isElectric || isMeasurement) {
    addMatch(["protoboard", "breadboard"], ({ students }) => Math.ceil(students / 2));
    addMatch(["resistencia", "ohm"], ({ students }) => students * 2);
    addMatch(["led"], ({ students }) => students);
    addMatch(["cable", "banana", "caiman", "jumper"], ({ students }) => students * 2);
    addMatch(["multimetro", "tester"], ({ students, stock }) => Math.min(Math.ceil(students / 5), stock));
    addMatch(["fuente", "transformador"], ({ stock }) => Math.min(4, stock));
  }
  if (isWorkshop) {
    addMatch(["lente", "protector", "seguridad"], ({ students }) => students);
    addMatch(["guante"], ({ students }) => students);
    addMatch(["metro", "huincha"], ({ stock }) => Math.min(6, stock));
    addMatch(["alicate"], ({ stock }) => Math.min(6, stock));
    addMatch(["destornillador"], ({ stock }) => Math.min(6, stock));
  }
  if (!items.length) {
    const departmentWords = normalizeHeader(`${teacher.department || ""} ${combinedPrompt}`).split(" ").filter((word) => word.length > 3);
    available
      .map((item) => {
        const haystack = normalizeHeader(`${item.name} ${item.category || ""} ${item.description || ""}`);
        const score = departmentWords.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
        return { ...item, lessonScore: score };
      })
      .filter((item) => item.lessonScore > 0)
      .sort((a, b) => b.lessonScore - a.lessonScore || Number(b.stock) - Number(a.stock))
      .slice(0, 6)
      .forEach((item) => {
        const key = `${item.type}-${item.id}`;
        if (usedKeys.has(key)) return;
        usedKeys.add(key);
        items.push({ ...item, qty: Math.max(1, Math.min(Number(item.stock) || 1, Math.ceil(students / 6))) });
      });
  }

  return {
    title: prompt ? `Preparacion sugerida para: ${prompt}` : "Preparacion sugerida de clase",
    summary: `Propuesta inicial para ${students} alumno(s), usando solo stock disponible.`,
    items: items.slice(0, 8),
    notes: [
      "Revisa cantidades antes de enviar la solicitud.",
      "La propuesta no descuenta stock hasta que el pañol confirme la entrega."
    ]
  };
}

function getTeacherPendingReturnLoans(loans = [], teacher = {}) {
  return loans
    .filter((loan) => loan.status === "activo")
    .filter((loan) => (loan.requesterType === "teacher" && loan.requesterId === teacher.id) || loan.responsibleTeacherId === teacher.id)
    .map((loan) => {
      const returnableItems = (loan.items || []).filter((item) => !item.nonReturnable);
      return {
        ...loan,
        folioText: displayFolio(loan, "PRE"),
        returnableItems,
        itemsText: returnableItems.map((item) => `${item.name} (${item.qty})`).join(", "),
        dueText: isOverdue(loan) ? `${overdueDays(loan.expectedReturn)} dia(s) de atraso` : `vence ${formatDate(loan.expectedReturn)}`,
        relatedTo: loan.requesterType === "teacher" ? "Prestamo directo al docente" : `Prestamo retirado por ${loan.requesterName}`
      };
    })
    .filter((loan) => loan.returnableItems.length > 0);
}

function statefulNameScore(name, requests) {
  const normalizedName = normalizeHeader(name);
  return requests.reduce((score, request) => score + (request.items || []).filter((item) => normalizeHeader(item.name) === normalizedName).length, 0);
}

function TeacherWorkspace({ currentUser, onLogout }) {
  const { state, dispatch, notify } = useApp();
  const [tab, setTab] = useState("home");
  const effectiveUser = getFreshAppUser(state, currentUser);
  const teacher = getTeacherForAppUser(state, effectiveUser);
  const canReserveWorkshop = userHasWorkshopAccess(state, effectiveUser);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [cartPulse, setCartPulse] = useState("");
  const [lastAdded, setLastAdded] = useState("");
  const [expectedDate, setExpectedDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [chatRequestId, setChatRequestId] = useState("");
  const [smartSuggestions, setSmartSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsSource, setSuggestionsSource] = useState("local");
  const [lessonPrompt, setLessonPrompt] = useState("");
  const [lessonRubricText, setLessonRubricText] = useState("");
  const [lessonRubricName, setLessonRubricName] = useState("");
  const [lessonRubricLoading, setLessonRubricLoading] = useState(false);
  const [lessonPlan, setLessonPlan] = useState(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonSource, setLessonSource] = useState("local");
  const [returnReminderOpen, setReturnReminderOpen] = useState(true);
  const [sendingPendingEmail, setSendingPendingEmail] = useState(false);
  const inventory = [
    ...state.materials.map((item) => ({ ...item, type: "material", statusText: `${item.stock} ${item.unit}` })),
    ...state.tools.map((item) => ({ ...item, type: "tool", category: "Herramientas", stock: item.status === "disponible" ? 1 : 0, statusText: item.status }))
  ].filter((item) => `${item.name} ${item.code} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const fullInventory = [
    ...state.materials.map((item) => ({ ...item, type: "material", statusText: `${item.stock} ${item.unit}` })),
    ...state.tools.map((item) => ({ ...item, type: "tool", category: "Herramientas", stock: item.status === "disponible" ? 1 : 0, statusText: item.status }))
  ];
  const myRequests = (state.requests || []).filter((request) => request.requesterId === teacher.id);
  const myMessages = (state.messages || []).filter((msg) => msg.teacherId === teacher.id).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const unreadTeacherMessagesCount = myMessages.filter((msg) => msg.from === "pañol" && !msg.teacherRead).length;
  const pendingReturnLoans = getTeacherPendingReturnLoans(state.loans || [], teacher);
  const pendingReturnItemsCount = pendingReturnLoans.reduce((total, loan) => total + loan.returnableItems.reduce((sum, item) => sum + Number(item.qty || 1), 0), 0);
  const pendingRequests = myRequests.filter((request) => request.status === "pendiente");
  const readyRequests = myRequests.filter((request) => ["preparada", "entregada"].includes(request.status));
  const recentRequests = [...myRequests].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 4);
  const studentLoanMessages = myMessages.filter((msg) => msg.loanId).slice(-4).reverse();
  const activeChatRequest = myRequests.find((request) => request.id === chatRequestId);
  const teacherNotifications = [
    ...myRequests
      .filter((request) => request.status !== "pendiente" && !request.teacherNotified)
      .map((request) => ({
        title: `${displayFolio(request, "SOL")} · ${request.status}`,
        body: request.reviewNotes || `${request.items.length} item(s) revisado(s)`,
        actionLabel: "Preguntar por solicitud",
        onOpen: () => {
          setChatRequestId(request.id);
          setChatOpen(true);
          dispatch({ type: "MARK_TEACHER_REQUEST_NOTIFIED", id: request.id });
        }
      })),
    ...myMessages
      .filter((msg) => msg.from === "pañol" && !msg.teacherRead)
      .map((msg) => ({
        title: "Respuesta del pañol",
        body: msg.body,
        actionLabel: "Responder chat",
        onOpen: () => {
          setChatOpen(true);
          dispatch({ type: "MARK_TEACHER_THREAD_READ", teacherId: teacher.id });
        }
      }))
  ];
  const sendPendingEmail = async () => {
    if (!teacher.email || !pendingReturnLoans.length) return;
    setSendingPendingEmail(true);
    try {
      const result = await sendEmailWithFallback(buildPendingReturnsEmailPayload(teacher, pendingReturnLoans));
      notify(result.mode === "mailto" ? "Resend esta limitado. Se abrio Outlook con el recordatorio listo para enviar." : "Correo de pendientes enviado al profesor");
    } catch (error) {
      notify(`No se pudo enviar el correo: ${error.message || error}`, "error");
    } finally {
      setSendingPendingEmail(false);
    }
  };
  const addToCart = (item) => {
    const existing = cart.find((cartItem) => cartItem.id === item.id && cartItem.type === item.type);
    if (existing) setCart(cart.map((cartItem) => cartItem === existing ? { ...cartItem, qty: Number(cartItem.qty) + 1 } : cartItem));
    else setCart([...cart, { type: item.type, id: item.id, name: item.name, code: item.code, category: item.category, qty: 1, nonReturnable: false }]);
    setLastAdded(item.name);
    setCartPulse("cart-pulse-blue");
    setTimeout(() => setCartPulse(""), 1100);
    setTimeout(() => setLastAdded(""), 2600);
  };
  const addSuggestionKit = (suggestion) => {
    const nextCart = [...cart];
    suggestion.items.forEach((item) => {
      const existing = nextCart.find((cartItem) => cartItem.id === item.id && cartItem.type === item.type);
      if (existing) existing.qty = Number(existing.qty) + Number(item.qty || 1);
      else nextCart.push({ type: item.type, id: item.id, name: item.name, code: item.code, category: item.category, qty: Number(item.qty || 1), nonReturnable: false });
    });
    setCart(nextCart);
    setCartOpen(true);
    setCartPulse("cart-pulse-blue");
    setTimeout(() => setCartPulse(""), 1100);
    notify("Sugerencia agregada al carrito");
  };
  const refreshSuggestions = async () => {
    const localSuggestions = buildLocalTeacherSuggestions({ teacher, inventory: fullInventory, requests: myRequests, cart });
    setSmartSuggestions(localSuggestions);
    setSuggestionsSource("local");
    if (!isSupabaseConfigured || !supabase) return;
    setSuggestionsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("teacher-suggestions", {
        body: {
          teacher: { name: teacher.name, department: teacher.department || "", email: teacher.email || "" },
          inventory: fullInventory.slice(0, 400).map((item) => ({ id: item.id, type: item.type, name: item.name, code: item.code, category: item.category, stock: item.stock, unit: item.unit, status: item.status })),
          recentRequests: myRequests.slice(-10).map((request) => ({ status: request.status, items: request.items, notes: request.notes })),
          cart
        }
      });
      if (error || !data?.suggestions?.length) throw error || new Error("Sin sugerencias remotas");
      setSmartSuggestions(data.suggestions);
      setSuggestionsSource("ia");
    } catch (error) {
      console.info("Sugerencias IA no disponibles, usando recomendaciones locales", error);
      setSuggestionsSource("local");
    } finally {
      setSuggestionsLoading(false);
    }
  };
  const prepareLesson = async () => {
    if (!lessonPrompt.trim()) return notify("Describe la clase que quieres preparar", "error");
    const localPlan = buildLocalLessonPlan({ prompt: lessonPrompt, rubricText: lessonRubricText, teacher, inventory: fullInventory });
    setLessonPlan(localPlan);
    setLessonSource("local");
    if (!isSupabaseConfigured || !supabase) return;
    setLessonLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("teacher-suggestions", {
        body: {
          mode: "lesson-plan",
          lessonPrompt,
          rubricText: lessonRubricText.slice(0, 6000),
          teacher: { name: teacher.name, department: teacher.department || "", email: teacher.email || "" },
          inventory: fullInventory.slice(0, 400).map((item) => ({ id: item.id, type: item.type, name: item.name, code: item.code, category: item.category, stock: item.stock, unit: item.unit, status: item.status })),
          recentRequests: myRequests.slice(-10).map((request) => ({ status: request.status, items: request.items, notes: request.notes })),
          cart
        }
      });
      if (error || !data?.lessonPlan?.items?.length) throw error || new Error("Sin preparacion remota");
      setLessonPlan(data.lessonPlan);
      setLessonSource("ia");
    } catch (error) {
      console.info("Preparador IA no disponible, usando propuesta local", error);
      setLessonSource("local");
    } finally {
      setLessonLoading(false);
    }
  };
  const addLessonPlanToCart = () => {
    if (!lessonPlan?.items?.length) return notify("No hay items sugeridos para agregar", "error");
    addSuggestionKit({ title: lessonPlan.title, items: lessonPlan.items });
  };
  const loadLessonRubric = async (file) => {
    if (!file) return;
    setLessonRubricLoading(true);
    try {
      const text = await readLessonContextFile(file);
      if (!text.trim()) throw new Error("Sin texto legible");
      setLessonRubricText(text.slice(0, 8000));
      setLessonRubricName(file.name);
      notify("Rúbrica agregada como contexto");
    } catch (error) {
      notify("No pude leer esa rúbrica. Prueba con PDF con texto o pega el contenido manualmente.", "error");
    } finally {
      setLessonRubricLoading(false);
    }
  };
  useEffect(() => {
    setSmartSuggestions(buildLocalTeacherSuggestions({ teacher, inventory: fullInventory, requests: myRequests, cart }));
    setSuggestionsSource("local");
  }, [teacher.id, state.requests.length, state.materials.length, state.tools.length]);
  useEffect(() => {
    setReturnReminderOpen(true);
  }, [teacher.id]);
  const submitRequest = () => {
    if (!cart.length) return notify("Agrega ítems al carrito", "error");
    dispatch({ type: "CREATE_REQUEST", request: { requesterType: "teacher", requesterId: teacher.id, requesterName: teacher.name, requesterEmail: teacher.email || "", department: teacher.department || "", expectedDate, notes, items: cart } });
    notify("Solicitud enviada al pañol");
    setCart([]);
    setNotes("");
    setTab("history");
    setCartOpen(false);
  };
  const sendMessage = () => {
    if (!message.trim()) return;
    dispatch({ type: "SEND_MESSAGE", message: { teacherId: teacher.id, teacherName: teacher.name, requestId: activeChatRequest?.id || "", requestTitle: activeChatRequest ? `${displayFolio(activeChatRequest, "SOL")} - ${activeChatRequest.items.length} item(s)` : "", from: "docente", to: "pañol", body: message.trim(), read: false } });
    notify("Mensaje enviado");
    setMessage("");
  };
  return (
    <div className="pc-shell pc-teacher-shell min-h-screen bg-steel-950 text-slate-100 theme-light">
      <header className="pc-topbar border-b border-steel-800 bg-steel-950/92 px-3 py-3 md:px-8 md:py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-safety-500/50 bg-white p-1 shadow-sm"><img src="/logo-salesiano.png" alt="Colegio Salesiano" className="h-full w-full object-contain" /></div>
            <div><p className="text-sm text-slate-400">PAÑOL CENTRAL / Portal docente</p><h1 className="text-2xl font-bold text-white">{teacher.name}</h1></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NotificationsBell notifications={teacherNotifications} onMarkRead={() => dispatch({ type: "MARK_TEACHER_NOTIFICATIONS_READ", teacherId: teacher.id })} />
            <Button variant="secondary" onClick={onLogout}><LogOut size={16} />Salir</Button>
          </div>
        </div>
      </header>
      <main className="pc-main app-main mx-auto grid max-w-7xl gap-4 p-3 md:gap-6 md:p-8">
        <div className="pc-mobile-nav mobile-nav -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[["home", LayoutDashboard, "Inicio"], ["inventory", Boxes, "Inventario"], ...(canReserveWorkshop ? [["workshop", CalendarDays, "Reservas taller"]] : []), ["history", History, "Mis solicitudes"]].map(([id, Icon, label]) => <Button key={id} variant={tab === id ? "primary" : "secondary"} onClick={() => setTab(id)} className="shrink-0 whitespace-nowrap"><Icon size={16} />{label}</Button>)}
        </div>
        {lastAdded && (
          <div className="cart-added-banner rounded-md border border-sky-500/60 bg-sky-500/15 px-4 py-3 text-sm font-semibold text-sky-100">
            <Check className="mr-2 inline" size={16} />Agregado al carrito: {lastAdded}
          </div>
        )}
        {state.settings.teacherReturnReminder !== "apagado" && pendingReturnLoans.length > 0 && returnReminderOpen && (
          <Modal title="ATENTO: devoluciones pendientes" onClose={() => setReturnReminderOpen(false)} wide>
            <div className="grid gap-4">
              <div className="rounded-md border border-red-500/50 bg-red-500/10 p-4">
                <p className="text-lg font-bold text-red-100">ATENTO ! recuerda bajar estos elementos a pañol lo antes posible!</p>
                <p className="mt-1 text-sm text-red-100/80">Tienes {pendingReturnItemsCount} elemento(s) pendiente(s) de devolución asociados a {pendingReturnLoans.length} préstamo(s). El servicio sigue habilitado, pero el pañol necesita cerrar estas entregas.</p>
              </div>
              <div className="grid max-h-[55vh] gap-3 overflow-auto pr-1">
                {pendingReturnLoans.map((loan) => (
                  <div key={loan.id} className={`rounded-md border p-4 ${isOverdue(loan) ? "border-red-500/50 bg-red-500/10" : "border-amber-500/45 bg-amber-500/10"}`}>
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-bold text-white">{loan.folioText} · {loan.relatedTo}</p>
                        <p className="text-sm text-slate-300">Fecha devolución: {formatDate(loan.expectedReturn)} · {loan.dueText}</p>
                      </div>
                      <Badge tone={isOverdue(loan) ? "red" : "amber"}>{isOverdue(loan) ? "vencido" : "pendiente"}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {loan.returnableItems.map((item) => (
                        <div key={`${loan.id}-${item.type}-${item.id}`} className="border-l-4 border-red-500 px-3 py-1.5">
                          <p className="font-extrabold text-red-700 dark:text-red-200">{item.name}</p>
                          <p className="text-xs font-bold text-red-600 dark:text-red-300">{item.code || "s/c"} · cantidad {item.qty}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" disabled={!teacher.email || sendingPendingEmail} onClick={sendPendingEmail}><FileCheck size={16} />{sendingPendingEmail ? "Enviando..." : "Enviar correo"}</Button>
                <Button variant="secondary" onClick={() => { setReturnReminderOpen(false); setChatOpen(true); }}><MessageSquare size={16} />Consultar al pañol</Button>
                <Button onClick={() => setReturnReminderOpen(false)}><Check size={16} />Entendido</Button>
              </div>
            </div>
          </Modal>
        )}
        {tab === "home" && (
          <div className="grid gap-4">
            <section className="grid gap-3 md:grid-cols-4">
              <div className="panel"><p className="text-sm text-slate-400">Solicitudes pendientes</p><p className="mt-2 text-3xl font-bold text-white">{pendingRequests.length}</p></div>
              <div className="panel"><p className="text-sm text-slate-400">Listas / entregadas</p><p className="mt-2 text-3xl font-bold text-white">{readyRequests.length}</p></div>
              <div className="panel"><p className="text-sm text-slate-400">Mensajes nuevos</p><p className="mt-2 text-3xl font-bold text-white">{unreadTeacherMessagesCount}</p></div>
              <button type="button" onClick={() => setCartOpen(true)} className={`panel text-left transition hover:border-safety-500 ${cartPulse}`}><p className="text-sm text-slate-400">Ítems en carrito</p><p className="mt-2 text-3xl font-bold text-white">{cart.length}</p></button>
            </section>
            <section className="panel grid gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="section-title mb-1"><Wand2 size={18} />Preparar clase con IA</h2>
                  <p className="text-sm text-slate-400">Describe la actividad y el sistema arma una propuesta de materiales disponibles para cargar al carrito.</p>
                </div>
                <Badge tone={lessonSource === "ia" ? "blue" : "amber"}>{lessonSource === "ia" ? "IA" : "local"}</Badge>
              </div>
              <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
                <textarea className={`${inputClass} min-h-24 resize-y`} value={lessonPrompt} onChange={(e) => setLessonPrompt(e.target.value)} placeholder="Ej: clase de circuitos en serie para 2 medio, 30 alumnos" />
                <Button onClick={prepareLesson} disabled={lessonLoading} className="self-start xl:self-stretch"><Wand2 size={16} />{lessonLoading ? "Preparando..." : "Preparar carrito"}</Button>
              </div>
              <div className="grid gap-3 xl:grid-cols-[minmax(260px,380px)_1fr]">
                <Field label="Rúbrica o guía de actividad">
                  <input className={inputClass} type="file" accept=".pdf,.txt,.md,.csv,text/plain,application/pdf" onChange={(e) => loadLessonRubric(e.target.files?.[0])} disabled={lessonRubricLoading} />
                </Field>
                <Field label={lessonRubricName ? `Contexto cargado: ${lessonRubricName}` : "Contexto manual opcional"}>
                  <textarea className={`${inputClass} min-h-20 resize-y`} value={lessonRubricText} onChange={(e) => { setLessonRubricText(e.target.value); if (!e.target.value) setLessonRubricName(""); }} placeholder="Pega aquí objetivos, indicadores, materiales mencionados o restricciones de la rúbrica" />
                </Field>
              </div>
              {lessonPlan && (
                <div className="rounded-md border border-sky-500/40 bg-sky-500/10 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-bold text-white">{lessonPlan.title}</p>
                      <p className="mt-1 text-sm text-slate-300">{lessonPlan.summary}</p>
                    </div>
                    <Button onClick={addLessonPlanToCart} disabled={!lessonPlan.items?.length}><PackagePlus size={16} />Agregar propuesta al carrito</Button>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {(lessonPlan.items || []).map((item) => (
                      <div key={`${item.type}-${item.id || item.code || item.name}`} className="rounded-md border border-steel-700 bg-steel-900/80 px-3 py-2">
                        <p className="font-semibold text-slate-100">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.code || "s/c"} · {item.category || item.type} · cantidad sugerida {item.qty || 1}</p>
                      </div>
                    ))}
                  </div>
                  {!!lessonPlan.notes?.length && <p className="mt-3 text-xs text-slate-400">{lessonPlan.notes.join(" ")}</p>}
                </div>
              )}
            </section>
            <section className="panel grid gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="section-title mb-1"><Wand2 size={18} />Sugerencias inteligentes</h2>
                  <p className="text-sm text-slate-400">{suggestionsSource === "ia" ? "Generadas con IA según tu perfil, historial y stock disponible." : "Recomendaciones locales según historial, área y disponibilidad."}</p>
                </div>
                <Button variant="secondary" onClick={refreshSuggestions} disabled={suggestionsLoading}><Wand2 size={16} />{suggestionsLoading ? "Analizando..." : "Actualizar IA"}</Button>
              </div>
              {smartSuggestions.length === 0 && <p className="rounded-md border border-steel-700 bg-steel-850 p-4 text-sm text-slate-400">Aún no hay historial suficiente para sugerir kits. Puedes buscar materiales en Inventario.</p>}
              <div className="grid gap-3 xl:grid-cols-3">
                {smartSuggestions.map((suggestion) => (
                  <div key={suggestion.id || suggestion.title} className="rounded-md border border-steel-700 bg-steel-850 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{suggestion.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{suggestion.reason}</p>
                      </div>
                      <Badge tone={suggestionsSource === "ia" ? "blue" : "amber"}>{suggestionsSource === "ia" ? "IA" : "local"}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {(suggestion.items || []).slice(0, 5).map((item) => (
                        <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-2 rounded-md border border-steel-700 bg-steel-900/70 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">{item.name}</p>
                            <p className="text-xs text-slate-400">{item.code || "s/c"} · {item.category || item.type} · disp. {item.stock ?? item.statusText ?? "revisar"}</p>
                          </div>
                          <Button variant="secondary" className="shrink-0 px-2 py-1" onClick={() => addToCart(item)}><Plus size={15} /></Button>
                        </div>
                      ))}
                    </div>
                    <Button className="mt-3 w-full" onClick={() => addSuggestionKit(suggestion)}><PackagePlus size={16} />Agregar sugerencia</Button>
                  </div>
                ))}
              </div>
            </section>
            <section className="grid gap-4 xl:grid-cols-[1fr_.9fr]">
              <div className="panel grid gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="section-title mb-0"><History size={18} />Últimas solicitudes</h2>
                  <Button variant="secondary" onClick={() => setTab("history")}><History size={16} />Ver todas</Button>
                </div>
                {recentRequests.length === 0 && <p className="rounded-md border border-steel-700 bg-steel-850 p-4 text-sm text-slate-400">Todavía no tienes solicitudes registradas.</p>}
                {recentRequests.map((request) => (
                  <button key={request.id} type="button" onClick={() => { setChatRequestId(request.id); setChatOpen(true); }} className="rounded-md border border-steel-700 bg-steel-850 p-3 text-left transition hover:border-safety-500">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="font-bold text-white">{displayFolio(request, "SOL")}</p><p className="text-sm text-slate-400">{request.items.map((item) => `${item.name} (${item.qty})`).join(", ")}</p></div>
                      <Badge tone={request.status === "rechazada" ? "red" : request.status === "pendiente" ? "amber" : request.status === "preparada" ? "blue" : "green"}>{request.status}</Badge>
                    </div>
                  </button>
                ))}
              </div>
              <div className="panel grid gap-3">
                <h2 className="section-title mb-0"><MessageSquare size={18} />Avisos del pañol</h2>
                {studentLoanMessages.length === 0 && unreadTeacherMessagesCount === 0 && <p className="rounded-md border border-steel-700 bg-steel-850 p-4 text-sm text-slate-400">Sin avisos nuevos por ahora.</p>}
                {studentLoanMessages.map((msg) => (
                  <button key={msg.id} type="button" onClick={() => setChatOpen(true)} className="rounded-md border border-steel-700 bg-steel-850 p-3 text-left transition hover:border-safety-500">
                    <p className="text-xs font-semibold uppercase tracking-wide text-safety-500">Préstamo informado</p>
                    <p className="mt-1 line-clamp-3 text-sm text-slate-300">{msg.body}</p>
                  </button>
                ))}
                {unreadTeacherMessagesCount > 0 && <Button onClick={() => setChatOpen(true)}><MessageSquare size={16} />Responder mensajes nuevos</Button>}
              </div>
            </section>
            <section className="panel">
              <h2 className="section-title"><PackagePlus size={18} />Accesos rápidos</h2>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setTab("inventory")}><Boxes size={16} />Buscar inventario</Button>
              </div>
            </section>
          </div>
        )}
        {tab === "inventory" && (
          <div className="panel grid gap-4">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar material, herramienta, código o categoría" /></div>
            <DataTable rows={inventory} columns={[["name", "Ítem"], ["code", "Código"], ["category", "Categoría"], ["statusText", "Disponible/estado"], ["location", "Ubicación"]]} actions={(row) => <Button variant="secondary" disabled={Number(row.stock) <= 0} onClick={() => addToCart(row)}><Plus size={16} />Agregar</Button>} compact />
          </div>
        )}
        {tab === "history" && <div className="panel"><DataTable rows={myRequests.map((request) => ({ ...request, folioText: displayFolio(request, "SOL"), itemsText: request.items.map((item) => `${item.name} (${item.qty}${item.prepStatus ? `, ${item.prepStatus}` : ""})`).join(", ") }))} columns={[["folioText", "Folio"], ["createdAt", "Fecha"], ["expectedDate", "Fecha requerida"], ["status", "Estado"], ["itemsText", "Ítems"], ["reviewNotes", "Respuesta pañol"]]} actions={(request) => <Button variant="secondary" onClick={() => { setChatRequestId(request.id); setChatOpen(true); }}><MessageSquare size={16} />Consultar</Button>} /></div>}
        {tab === "workshop" && canReserveWorkshop && <WorkshopReservations currentUser={currentUser} />}
        {chatOpen && (
          <Modal title="Chat con pañol" onClose={() => setChatOpen(false)}>
          <div className="grid gap-4">
            <Field label="Asociar mensaje a solicitud">
              <select className={inputClass} value={chatRequestId} onChange={(e) => setChatRequestId(e.target.value)}>
                <option value="">Chat general</option>
                {myRequests.map((request) => <option key={request.id} value={request.id}>{displayFolio(request, "SOL")} - {request.status} - {request.items.map((item) => item.name).join(", ")}</option>)}
              </select>
            </Field>
            <div className="max-h-96 overflow-auto rounded-md border border-steel-700 bg-steel-850 p-3">
              {myMessages.length === 0 && <p className="text-sm text-slate-400">Sin mensajes todavía</p>}
              {myMessages.map((msg) => <div key={msg.id} className={`mb-3 rounded-md p-3 ${msg.from === "docente" ? "bg-safety-500/15" : "bg-steel-800"}`}><p className="text-xs text-slate-400">{msg.from === "docente" ? "Tú" : "Pañol"} · {formatDate(msg.date)} {msg.time}</p>{msg.requestId && <button type="button" onClick={() => setChatRequestId(msg.requestId)} className="mb-2 mt-1 rounded-md border border-safety-500/40 bg-safety-500/10 px-2 py-1 text-xs font-semibold text-safety-500">{msg.requestTitle || "Solicitud asociada"}</button>}<p>{msg.body}</p></div>)}
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]"><input className={inputClass} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escribe un mensaje al pañolero" onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }} /><Button onClick={sendMessage}><MessageSquare size={16} />Enviar</Button></div>
          </div>
          </Modal>
        )}
        {cartOpen && (
          <Modal title={`Carrito de solicitud (${cart.length})`} onClose={() => setCartOpen(false)}>
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2"><Field label="Fecha requerida"><input className={`${inputClass} cursor-pointer`} type="date" value={expectedDate} onClick={(e) => e.currentTarget.showPicker?.()} onFocus={(e) => e.currentTarget.showPicker?.()} onChange={(e) => setExpectedDate(e.target.value)} /></Field><Field label="Observaciones"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Curso, módulo, actividad" /></Field></div>
              <EditableCart rows={cart} setRows={setCart} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => setCartOpen(false)}>Seguir agregando</Button>
                <Button onClick={submitRequest} disabled={!cart.length}><FileCheck size={16} />Enviar solicitud al pañol</Button>
              </div>
            </div>
          </Modal>
        )}
      </main>
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className={`cart-fab fixed bottom-24 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-sky-600 text-white shadow-2xl transition hover:bg-sky-700 ${cartPulse}`}
        title="Abrir carrito"
      >
        <PackagePlus size={24} />
        {cart.length > 0 && <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{cart.length}</span>}
      </button>
      <button
        type="button"
        onClick={() => {
          setChatOpen(true);
          dispatch({ type: "MARK_TEACHER_THREAD_READ", teacherId: teacher.id });
        }}
        className="chat-fab fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-safety-500 text-steel-950 shadow-2xl transition hover:bg-safety-600"
        title="Abrir chat"
      >
        <MessageSquare size={24} />
        {unreadTeacherMessagesCount > 0 && <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{unreadTeacherMessagesCount}</span>}
      </button>
    </div>
  );
}

function EditableCart({ rows, setRows }) {
  if (!rows.length) return <div className="rounded-md border border-steel-700 p-6 text-center text-slate-400">Carrito vacío</div>;
  return <DataTable rows={rows} columns={[["name", "Ítem"], ["code", "Código"], ["type", "Tipo"], ["qty", "Cantidad"]]} actions={(row) => <div className="flex justify-end gap-2"><input className={`${inputClass} w-24`} type="number" min="1" value={row.qty} onChange={(e) => setRows(rows.map((item) => item === row ? { ...item, qty: Number(e.target.value) } : item))} /><Button variant="ghost" className="px-2 text-red-300" onClick={() => setRows(rows.filter((item) => item !== row))}><X size={16} /></Button></div>} compact />;
}

function getTeacherForAppUser(state, user) {
  const username = normalizeHeader(user.username || "");
  const teacher = state.teachers.find((person) => normalizeHeader(person.email?.split("@")[0] || "") === username || normalizeHeader(person.email || "") === username || normalizeHeader(person.name) === normalizeHeader(user.name));
  return teacher || { id: `app-${user.id}`, name: user.name, email: "", department: user.role || "Docente" };
}

function getFreshAppUser(state, user) {
  if (!user) return null;
  const users = getAppUsers(state);
  const normalizedId = normalizeHeader(user.id || "");
  const normalizedEmail = normalizeHeader(user.email || "");
  const normalizedUsername = normalizeHeader(user.username || "");
  return users.find((item) => item.active !== false && (
    normalizeHeader(item.id || "") === normalizedId ||
    (normalizedEmail && normalizeHeader(item.email || "") === normalizedEmail) ||
    (normalizedUsername && normalizeHeader(item.username || "") === normalizedUsername)
  )) || user;
}

function userHasWorkshopAccess(state, user) {
  const freshUser = getFreshAppUser(state, user);
  if (freshUser?.permissions?.includes("workshop")) return true;
  const teacher = getTeacherForAppUser(state, freshUser || user || {});
  const allowedEmails = defaultWorkshopTeacherEmails.map((email) => normalizeHeader(email));
  const emailKeys = [
    freshUser?.email,
    freshUser?.username?.includes("@") ? freshUser.username : "",
    teacher?.email
  ].map((value) => normalizeHeader(value || "")).filter(Boolean);
  const usernameKeys = [
    freshUser?.username,
    freshUser?.email?.split("@")[0],
    teacher?.email?.split("@")[0]
  ].map((value) => normalizeHeader(value || "")).filter(Boolean);
  return emailKeys.some((email) => allowedEmails.includes(email)) ||
    usernameKeys.some((username) => allowedEmails.some((email) => email.split("@")[0] === username));
}

createRoot(document.getElementById("root")).render(<App />);
