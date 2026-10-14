import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Abre la app desde cero (sin progreso ni ajustes guardados). */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
}

/**
 * Letra (0 = C … 6 = B) de la nota que toca responder, leída de su posición en el pentagrama de
 * clave de Sol: la línea inferior es E4 (paso 30) y cada posición sube 5 unidades.
 */
export function currentLetter(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const glyph = document.querySelector('.note-current .note-shape text.glyph');
    if (!glyph) return null;
    const pos = Math.round((115 - Number(glyph.getAttribute('y'))) / 5);
    return (((30 + pos) % 7) + 7) % 7;
  });
}

/** Pulsa una tecla blanca (0 = C … 6 = B) o negra (índice 0-4 entre las negras). */
export async function press(page: Page, index: number, black = false): Promise<void> {
  await page.locator(black ? '.key-black' : '.key-white').nth(index).dispatchEvent('pointerdown');
}

/** Responde hasta terminar el ejercicio: las primeras `wrong` notas mal y el resto bien. */
export async function playThrough(page: Page, wrong = 0): Promise<void> {
  for (let guard = 0; guard < 300; guard++) {
    if (await page.locator('.results').isVisible()) return;
    const letter = await currentLetter(page);
    const locked = await page.locator('.keyboard-locked').count();
    if (letter === null || locked > 0) {
      await page.waitForTimeout(60);
      continue;
    }
    await press(page, wrong > 0 ? (letter + 1) % 7 : letter);
    if (wrong > 0) wrong--;
    await page.waitForTimeout(40);
  }
  await expect(page.locator('.results')).toBeVisible();
}
