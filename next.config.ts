import type { NextConfig } from "next";

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
};

export default nextConfig;
