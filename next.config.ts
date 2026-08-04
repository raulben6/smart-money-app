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
// Dominios de Clerk verificados contra la publishable key del proyecto
// (`.env.local`): `pk_test_...` decodifica a
// `complete-beetle-26.clerk.accounts.dev`, la instancia dev provista por el
// Marketplace de Vercel — confirma el comodín `https://*.clerk.accounts.dev`.
// No se encontró referencia a `clerk.services` en la documentación vendida
// en `.claude/skills/clerk-*`, así que no se añade (ver informe de Task 15).
// Si en producción se configura un dominio propio de Clerk, esta lista debe
// actualizarse (a re-verificar en el smoke test de Task 16).
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
  "connect-src 'self' https://*.clerk.accounts.dev",
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
