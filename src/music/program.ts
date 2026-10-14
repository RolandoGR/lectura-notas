import { CLEFS, clefRange } from './pitch';
import type { ClefId } from './pitch';
import type { Difficulty } from './phrases';
import type { DisplayMode } from '../game/session';

export interface Stage {
  title: string;
  hint: string;
  display: DisplayMode;
  goal: number;
}

/** Una ronda del modo inteligente: los mismos ejercicios con el conjunto de notas actual. */
export const STAGES: Stage[] = [
  { title: 'Grupos fijos', hint: 'Lee cada grupo de notas con calma.', display: 'static', goal: 20 },
  { title: 'En movimiento', hint: 'Las notas avanzan hacia la clave y te esperan allí.', display: 'moving', goal: 30 },
  { title: 'De memoria', hint: 'Mira el grupo, se oculta y lo tocas.', display: 'hidden', goal: 10 },
  { title: 'Con pulso', hint: 'Metrónomo: una nota por pulso, sin detenerse al fallar.', display: 'pulse', goal: 20 },
];

/** Las tres notas con las que empieza cada clave: la que señala la clave y las dos siguientes. */
export function initialNotes(clef: ClefId): number[] {
  const anchor = CLEFS[clef].anchor;
  return [anchor, anchor + 1, anchor + 2];
}

/** Notas que se pueden añadir a continuación: la inmediata por abajo y la inmediata por arriba. */
export function nextChoices(clef: ClefId, notes: number[]): { lower: number | null; upper: number | null } {
  const range = clefRange(clef);
  const low = Math.min(...notes) - 1;
  const high = Math.max(...notes) + 1;
  return {
    lower: low >= range[0] ? low : null,
    upper: high <= range[range.length - 1] ? high : null,
  };
}

/** Con pocas notas, saltos pequeños y ritmo tranquilo; al crecer el conjunto sube un punto. */
export function journeyDifficulty(noteCount: number): Difficulty {
  return noteCount <= 7 ? 1 : 2;
}

/** Pulsos por minuto del ejercicio con metrónomo del modo inteligente. */
export function journeyBpm(noteCount: number): number {
  return noteCount <= 7 ? 50 : 60;
}

/** Tres estrellas por encima del 90 %, dos del 81 al 90 % y una desde el 70 %. */
export function starsFor(correct: number, wrong: number): number {
  const total = correct + wrong;
  if (total === 0) return 0;
  const percent = Math.round((correct / total) * 100);
  if (percent > 90) return 3;
  if (percent >= 81) return 2;
  if (percent >= 70) return 1;
  return 0;
}
