import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Guardia contra la clase de bug del incidente `hrefFor` (F2-T18, smoke 3):
  // una función pasada como prop desde un Server Component a uno cliente NO es
  // serializable y revienta SOLO en runtime — invisible para tsc/build/review.
  // Esta regla prohíbe funciones inline en atributos JSX dentro de app/ (donde
  // casi todo es Server Component); los únicos archivos 'use client' bajo app/
  // quedan excluidos. No cubre funciones pasadas por identificador, pero sí la
  // forma inline que causó el incidente, a costo de mantenimiento cero.
  {
    files: ["app/**/*.tsx"],
    ignores: ["app/**/error.tsx", "app/onboarding/onboarding-form.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute > JSXExpressionContainer > :matches(ArrowFunctionExpression, FunctionExpression)",
          message:
            "Un Server Component no puede pasar funciones a un componente cliente (no serializable). Pasa un string/dato y construye la función dentro del componente cliente.",
        },
      ],
    },
  },
]);

export default eslintConfig;
