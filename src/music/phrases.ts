// Generación de frases. La idea es que los ejercicios se parezcan a música real:
// movimiento por grados conjuntos con algún salto, y fragmentos de melodías conocidas.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(rng: Rng, items: T[], weight: (item: T) => number): T {
  const weights = items.map(weight);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

export type Difficulty = 1 | 2 | 3;

// Peso de cada salto medido en notas del conjunto disponible (1 = nota vecina).
const LEAP_WEIGHT = [0, 1, 0.55, 0.3, 0.22, 0.15, 0.1, 0.1];
const MAX_LEAP: Record<Difficulty, number> = { 1: 2, 2: 4, 3: 7 };

export interface WalkOptions {
  /** Pasos disponibles, en orden ascendente. */
  pool: number[];
  length: number;
  difficulty: Difficulty;
  rng: Rng;
  weightOf?: (step: number) => number;
  /** Última nota de la frase anterior, para que la siguiente empiece cerca. */
  from?: number;
}

export function walkPhrase(opts: WalkOptions): number[] {
  const { pool, length, difficulty, rng } = opts;
  const weightOf = opts.weightOf ?? (() => 1);
  if (pool.length === 0) return [];
  if (pool.length === 1) return Array.from({ length }, () => pool[0]);

  const indices = pool.map((_, i) => i);
  const maxLeap = Math.min(MAX_LEAP[difficulty], pool.length - 1);
  const nextIndex = (i: number) => {
    const candidates = indices.filter((j) => j !== i && Math.abs(j - i) <= maxLeap);
    return pickWeighted(rng, candidates, (j) => LEAP_WEIGHT[Math.abs(j - i)] * weightOf(pool[j]));
  };

  let current: number;
  const fromIndex = opts.from === undefined ? -1 : pool.indexOf(opts.from);
  if (fromIndex >= 0) current = nextIndex(fromIndex);
  else current = pickWeighted(rng, indices, (j) => weightOf(pool[j]));

  const phrase = [pool[current]];
  while (phrase.length < length) {
    current = nextIndex(current);
    phrase.push(pool[current]);
  }
  return phrase;
}

// Fragmentos de melodías de dominio público, como grados respecto a Do (0 = Do, 1 = Re, -1 = Si grave).
const MELODIES: number[][] = [
  [2, 2, 3, 4, 4, 3, 2, 1], // Oda a la alegría
  [0, 0, 1, 2, 2, 1, 1],
  [0, 1, 2, 0, 0, 1, 2, 0], // Frère Jacques
  [2, 3, 4, 2, 3, 4],
  [0, 0, 4, 4, 5, 5, 4], // Estrellita
  [3, 3, 2, 2, 1, 1, 0],
  [0, 0, 0, 1, 2, 1], // Au clair de la lune
  [0, 2, 1, 1, 0],
  [2, 1, 0, 1, 2, 2, 2], // Mary tenía un corderito
  [2, 1, 0, 2, 1, 0], // Hot cross buns
  [0, 2, 3, 4, 0, 2, 3, 4], // When the Saints
  [7, 6, 5, 4, 3, 2, 1, 0], // Joy to the World
  [0, 0, 2, 2, 4, 4, 2], // Sinfonía «Sorpresa» (Haydn)
  [3, 3, 1, 1, -1, -1, -3],
  [4, 2, 2, 3, 1, 1], // Lightly row
  [0, 1, 2, 3, 4, 4, 4],
  [2, 4, 4, 2, 1, 0], // Largo de la Sinfonía del Nuevo Mundo (Dvořák)
  [1, 2, 4, 2, 1],
  [2, 2, 2, 2, 2, 2], // Jingle Bells
  [2, 4, 0, 1, 2],
  [4, 5, 4, 3, 2, 3, 4], // London Bridge
  [1, 2, 3, 2, 3, 4],
  [0, 0, 0, 1, 2], // Row, row, row your boat
  [2, 1, 2, 3, 4],
  [-3, -3, -2, -3, 0, -1], // Cumpleaños feliz
];

/** Devuelve un fragmento de melodía que quepa entero en el conjunto de notas, o null si ninguno cabe. */
export function melodyPhrase(pool: number[], rng: Rng): number[] | null {
  const available = new Set(pool);
  const fits: number[][] = [];
  for (const melody of MELODIES) {
    for (let octave = 1; octave <= 6; octave++) {
      const steps = melody.map((degree) => octave * 7 + degree);
      if (steps.every((s) => available.has(s))) fits.push(steps);
    }
  }
  if (fits.length === 0) return null;
  return fits[Math.floor(rng() * fits.length)];
}
