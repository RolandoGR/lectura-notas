import { defineConfig } from '@playwright/test';

const ci = Boolean(process.env.CI);

// Pruebas de pantallas sobre la app ya compilada (npm run build). En el ordenador se usa el Edge
// instalado; en GitHub, el Chromium que instala Playwright.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: true,
  retries: ci ? 1 : 0,
  reporter: ci ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel: ci ? undefined : 'msedge',
    // teléfono en horizontal, la orientación habitual de la app
    viewport: { width: 812, height: 375 },
    // el servicio sin conexión guardaría versiones entre pruebas: aquí no hace falta
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !ci,
  },
});
