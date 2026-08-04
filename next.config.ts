import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// CSP solo en producción: Next inyecta scripts inline y usa eval para
// HMR/React Refresh en dev, que la política bloquearía sin aportar
// protección real (localhost no es un objetivo de ataque). `NODE_ENV` se
// evalúa en build time aquí (`next.config.ts` corre en Node al hacer
// `next build`/`next start`), que es lo correcto: la cabecera queda fija
// según cómo se compiló, igual que en `next dev`.
//
// El frontend-API host de Clerk depende de la instancia (dev vs. producción)
// y no es fijo: se deriva en build time desde `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
// (la parte después de `pk_test_`/`pk_live_` es base64 del host, con un `$`
// final a recortar). Si la env var no está disponible en build, se cae al
// comodín dev (`*.clerk.accounts.dev`). Se incluyen SIEMPRE ambos comodines
// (`clerk.accounts.dev` y `clerk.services`) además del host derivado, para no
// romper si Clerk usa subrecursos de otro subdominio.
// Importante: al pasar Clerk a una instancia de producción (dominio propio),
// hay que REDEPLOYAR para que este host derivado se actualice — next.config.ts
// se evalúa en build time, no en cada request.
function deriveClerkFrontendApiHost(): string | null {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const match = key?.match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;
  try {
    const host = Buffer.from(match[1], "base64").toString("utf8").replace(/\$$/, "");
    return host || null;
  } catch {
    return null;
  }
}

const clerkFrontendApiHost = deriveClerkFrontendApiHost();
const clerkHosts = [
  ...(clerkFrontendApiHost ? [`https://${clerkFrontendApiHost}`] : []),
  "https://*.clerk.accounts.dev",
  "https://*.clerk.services",
].join(" ");

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${clerkHosts} https://challenges.cloudflare.com`,
  `connect-src 'self' ${clerkHosts}`,
  "img-src 'self' blob: data: https://img.clerk.com",
  "style-src 'self' 'unsafe-inline'",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default es 1 MB; las capturas de trades permiten hasta 5 MB
      // (validado en `uploadCapture`) y el body de un Server Action es
      // multipart/form-data, que añade overhead de boundaries/headers de
      // parte sobre el tamaño del archivo. 6 MB deja margen para ese
      // overhead sin acercarse al límite real (5 MB) que ya se valida en
      // la propia acción.
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    const headers = [...securityHeaders];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: cspDirectives });
    }
    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
