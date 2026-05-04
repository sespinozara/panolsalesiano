# PAÑOL CENTRAL COLEGIO SALESIANO

Web app React para gestionar el pañol de una institución educativa: dashboard, CRUD de personas e inventario, préstamos, devoluciones, carga de facturas y reportes exportables.

## Ejecutar

```bash
npm install
npm run dev
```

Luego abre la URL que entrega Vite, normalmente `http://127.0.0.1:5173`.

## Stack

- React con hooks, `useReducer` y Context API
- Tailwind CSS
- Recharts
- Lucide React
- PDF.js para lectura automática de PDFs con texto
- Persistencia local en `localStorage`
- Sincronización opcional con Supabase para uso multiusuario

## Importación de datos

El módulo `Bases de datos` acepta archivos CSV o JSON para cargar alumnos, profesores, materiales y herramientas. Las columnas pueden venir con nombres simples como `nombre`, `rut`, `curso`, `codigo`, `stock`, `ubicacion`, `estado` o sus equivalentes en inglés.

En `Facturas`, el botón de lectura automática extrae posibles ítems desde PDFs con texto seleccionable. Si el PDF es una imagen escaneada, se requiere OCR o carga manual de los ítems.

## Datos iniciales

La app inicia sin registros de demostración. Los datos reales se cargan desde el módulo `Bases de datos` y quedan persistidos en `localStorage` o, si Supabase está configurado, en la base central.

## Modo multiusuario con Supabase

Esta primera integración usa Supabase como base central compartida. La app sigue funcionando sin internet ni claves de Supabase, pero cuando configuras las variables de entorno todos los computadores sincronizan el mismo estado del pañol.

1. Crea un proyecto en Supabase.
2. En Supabase, abre `SQL Editor` y ejecuta el contenido de `supabase/schema.sql`.
3. Copia `.env.example` como `.env`.
4. En `.env`, completa:

```bash
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY_PUBLICA
```

5. Reinicia la app:

```bash
npm run dev
```

Para publicar la app en internet puedes usar Vercel, Netlify o Cloudflare Pages y configurar esas mismas variables de entorno en el panel del hosting.

Nota: esta etapa centraliza los datos en una fila JSON para migrar rápido desde la versión local. Una segunda etapa recomendable es separar alumnos, docentes, inventario, solicitudes y mensajes en tablas independientes con permisos más finos por perfil.

La app inicia sin registros de demostración. Los datos reales se cargan desde el módulo `Bases de datos` y quedan persistidos en `localStorage`.

## Sugerencias inteligentes con IA

El portal docente incluye sugerencias de materiales por perfil. La app funciona siempre con recomendaciones locales basadas en historial, departamento y stock disponible. Para activar IA real, despliega la Edge Function de Supabase y guarda la clave como secreto del proyecto:

```bash
supabase functions deploy teacher-suggestions
supabase secrets set OPENAI_API_KEY=tu_clave_openai
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

La clave de OpenAI queda en Supabase, no en el navegador ni en Cloudflare.

Para el asistente IA del administrador/pañolero despliega tambien:

```bash
npx supabase functions deploy panol-assistant
```

Usa los mismos secretos `OPENAI_API_KEY` y `OPENAI_MODEL` que configuraste para `teacher-suggestions`.
