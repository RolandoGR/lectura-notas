import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// El navegador recibe como «micrófono» una grabación real de piano (C4) que se repite en bucle.
const recording = fileURLToPath(new URL('../fixtures/piano-c4.wav', import.meta.url));

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${recording}`,
    ],
  },
  permissions: ['microphone'],
});

test('el micrófono reconoce un C tocado en un piano real', async ({ page }) => {
  await openApp(page);
  // antes de nada: el micrófono tiene que ser el simulado, nunca uno real
  const device = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const label = stream.getAudioTracks()[0].label;
    stream.getTracks().forEach((track) => track.stop());
    return label;
  });
  expect(device).toMatch(/fake/i);

  await page.locator('.card', { hasText: 'Modo inteligente' }).click();
  await page.locator('.stage', { hasText: 'Grupos fijos' }).click();
  // se anota qué tecla marca la app como tocada (el destello dura menos de medio segundo)
  await page.evaluate(() => {
    const names = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'D#', 'F#', 'G#', 'A#'];
    const heard: string[] = [];
    (window as unknown as { heard: string[] }).heard = heard;
    new MutationObserver(() => {
      const index = [...document.querySelectorAll('.key')].findIndex(
        (key) => key.classList.contains('key-bad') || key.classList.contains('key-ok'),
      );
      if (index >= 0 && heard[heard.length - 1] !== names[index]) heard.push(names[index]);
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.getByRole('button', { name: /piano real/ }).click();
  await expect(page.locator('.tool-on')).toBeVisible();
  // las notas del ejercicio son G, A y B: el C que suena cuenta como fallo
  await expect(page.locator('.misses')).toBeVisible({ timeout: 8_000 });
  expect(await page.evaluate(() => (window as unknown as { heard: string[] }).heard)).toContain('C');
});
