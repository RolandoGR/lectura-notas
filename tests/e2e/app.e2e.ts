import { expect, test } from '@playwright/test';
import { currentLetter, openApp, playThrough, press } from './helpers';

test('el inicio muestra los seis modos y carga los símbolos musicales', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.card-title')).toHaveText([
    'Sesión de hoy',
    'Modo inteligente',
    'Modo manual',
    'Canciones',
    'Reto diario',
    'Progreso',
  ]);
  expect(await page.evaluate(() => document.fonts.check('40px "Notas Glifos"', ''))).toBe(true);
});

test('grupos fijos: un fallo en 21 respuestas da tres estrellas y la gráfica por nota', async ({ page }) => {
  await openApp(page);
  await page.locator('.card', { hasText: 'Modo inteligente' }).click();
  await page.locator('.stage', { hasText: 'Grupos fijos' }).click();
  await expect(page.locator('.key-label').first()).toContainText('C');
  await playThrough(page, 1);
  await expect(page.locator('.results-title')).toHaveText('¡Bien tocado!');
  await expect(page.locator('.results-stars .star-on')).toHaveCount(3);
  await expect(page.locator('.stat-ok')).toHaveText('20');
  await expect(page.locator('.stat-bad')).toHaveText('1');
  await expect(page.locator('.chart-col')).toHaveCount(7);
});

test('en movimiento la nota pendiente se detiene junto a la clave y espera', async ({ page }) => {
  // en vertical el pentagrama es más estrecho y la nota llega antes
  await page.setViewportSize({ width: 390, height: 800 });
  await openApp(page);
  await page.locator('.card', { hasText: 'Modo inteligente' }).click();
  await page.locator('.stage', { hasText: 'En movimiento' }).click();
  await expect(page.locator('.band-waiting')).toBeVisible({ timeout: 20_000 });
  const stream = page.locator('.staff g[mask] > g');
  const before = await stream.getAttribute('transform');
  await page.waitForTimeout(800);
  expect(await stream.getAttribute('transform')).toBe(before);
  await expect(page.locator('.misses')).toHaveCount(0);
  // al responder, la lectura sigue
  await press(page, (await currentLetter(page))!);
  await expect(page.locator('.progress-text')).toHaveText('1 / 30');
});

test('con pulso, las notas que pasan sin respuesta cuentan como fallo y la lectura sigue', async ({ page }) => {
  await openApp(page);
  await page.locator('.card', { hasText: 'Modo inteligente' }).click();
  await page.locator('.stage', { hasText: 'Con pulso' }).click();
  await expect(page.locator('.feedback')).toContainText('Entrada');
  await expect(page.locator('.misses')).toContainText('2', { timeout: 15_000 });
  await expect(page.locator('.play')).toBeVisible();
  await expect(page.locator('.band-beat')).toBeVisible();
});

test('el botón Atrás vuelve a la pantalla anterior en vez de salir de la app', async ({ page }) => {
  await openApp(page);
  await page.locator('.card', { hasText: 'Modo inteligente' }).click();
  await page.locator('.stage', { hasText: 'Grupos fijos' }).click();
  await expect(page.locator('.play')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.page-header h1')).toHaveText('Modo inteligente');
  await page.goBack();
  await expect(page.locator('.home-header')).toBeVisible();
  // seguimos en la app: el historial no se ha salido de ella
  expect(new URL(page.url()).port).toBe('4173');
});

test('modo manual: pentagrama doble con armadura de dos sostenidos', async ({ page }) => {
  await openApp(page);
  await page.locator('.card', { hasText: 'Modo manual' }).click();
  await page.locator('.segment', { hasText: 'Doble' }).click();
  await page.locator('.segment', { hasText: '2 ♯' }).click();
  await expect(page.getByText('Tonalidad de D mayor')).toBeVisible();
  await page.getByRole('button', { name: 'Empezar' }).click();
  // dos claves y dos sostenidos en cada pentagrama; las teclas negras se activan
  await expect(page.locator('.staff .clef')).toHaveCount(6);
  await expect(page.locator('.key-black:not(.key-inert)')).toHaveCount(5);
});

test('canciones propias: valida el texto, se guardan y se tocan con teclas negras', async ({ page }) => {
  await openApp(page);
  await page.locator('.card', { hasText: 'Canciones' }).click();
  await page.locator('.song-form summary').click();
  await page.locator('.song-form input').fill('Mi prueba');
  await page.locator('.song-form textarea').fill('G4 A4 X9');
  await page.getByRole('button', { name: 'Guardar canción' }).click();
  await expect(page.locator('.song-form .hint-warn')).toContainText('X9');
  await page.locator('.song-form textarea').fill('G4 A4 B4 C5\nB4 Bb4 A4 G4');
  await page.getByRole('button', { name: 'Guardar canción' }).click();
  await page.locator('.song-row .stage', { hasText: 'Mi prueba' }).click();
  for (const key of [4, 5, 6, 0, 6, 'Bb', 5, 4] as const) {
    await expect(page.locator('.keyboard-locked')).toHaveCount(0);
    if (key === 'Bb') await press(page, 4, true);
    else await press(page, key);
    await page.waitForTimeout(60);
  }
  await expect(page.locator('.results-title')).toHaveText('¡Bien tocado!');
  await expect(page.locator('.stat-ok')).toHaveText('8');
});

test('copia de seguridad: lo exportado se vuelve a importar', async ({ page }) => {
  await openApp(page);
  await page.locator('.home-header .icon-button').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar a un archivo' }).click();
  const file = await (await download).path();
  await page.locator('.file-button input').setInputFiles(file);
  await expect(page.getByText('Copia combinada')).toBeVisible();
});
