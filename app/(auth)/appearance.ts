/** Apariencia congelada del login (paleta Nocturne violeta original): las
 *  pantallas de (auth) no siguen el tema claro/oscuro de la app. Estos valores
 *  vivían en el ClerkProvider del root layout antes de la migración de tema. */
export const authAppearance = {
  variables: {
    colorPrimary: '#9184d9',
    colorBackground: '#232532',
    colorForeground: '#e9e9ed',
    colorInput: '#161826',
    colorInputForeground: '#e9e9ed',
    borderRadius: '8px',
  },
} as const
