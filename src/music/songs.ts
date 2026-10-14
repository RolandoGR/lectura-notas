import { CLEFS, MIDDLE_C, clefRange } from './pitch';
import type { Accidental, ClefId, Pitch } from './pitch';

export interface Song {
  id: string;
  title: string;
  /** Frases de la melodía, sin ritmo: solo la sucesión de alturas. */
  phrases: Pitch[][];
}

// Una frase más larga no cabe en el pentagrama: se parte en trozos de este tamaño.
const MAX_PHRASE = 8;
const LETTERS = 'CDEFGAB';

/**
 * Lee una melodía escrita con letras y octavas: «E5 D#5 E5 B4», una frase por línea (o separadas
 * con «/»). Sostenido con # y bemol con b. Devuelve las frases o un mensaje de error.
 */
export function parseSong(text: string): { phrases: Pitch[][] } | { error: string } {
  const phrases: Pitch[][] = [];
  for (const line of text.split(/[\n/|]/)) {
    const tokens = line.trim().split(/[\s,]+/).filter(Boolean);
    const phrase: Pitch[] = [];
    for (const token of tokens) {
      const match = /^([A-G])([#♯b♭]?)(\d)$/.exec(token[0].toUpperCase() + token.slice(1));
      if (!match) return { error: `No entiendo «${token}». Escribe cada nota como letra y octava, por ejemplo C4, F#4 o Bb3.` };
      const acc: Accidental = match[2] === '' ? 0 : match[2] === '#' || match[2] === '♯' ? 1 : -1;
      phrase.push({ step: Number(match[3]) * 7 + LETTERS.indexOf(match[1]), acc });
    }
    for (let i = 0; i < phrase.length; i += MAX_PHRASE) phrases.push(phrase.slice(i, i + MAX_PHRASE));
  }
  if (phrases.length === 0) return { error: 'Escribe al menos una nota.' };
  return { phrases };
}

function written(text: string): Pitch[][] {
  const parsed = parseSong(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.phrases;
}

/** Frases dadas como grados respecto al Do central (0 = Do, 7 = Do agudo, -1 = Si grave). */
function degrees(phrases: number[][]): Pitch[][] {
  return phrases.map((phrase) => phrase.map((degree) => ({ step: MIDDLE_C + degree, acc: 0 })));
}

// Melodías tradicionales y clásicas de dominio público.
export const SONGS: Song[] = [
  {
    id: 'hot-cross-buns',
    title: 'Hot Cross Buns',
    phrases: degrees([
      [2, 1, 0],
      [2, 1, 0],
      [0, 0, 0, 0, 1, 1, 1, 1],
      [2, 1, 0],
    ]),
  },
  {
    id: 'pollitos',
    title: 'Los pollitos dicen',
    phrases: written('C4 D4 E4 F4 G4 G4 / A4 A4 A4 A4 G4 / F4 F4 F4 F4 E4 E4 / D4 D4 D4 D4 C4'),
  },
  {
    id: 'mary',
    title: 'Mary tenía un corderito',
    phrases: degrees([
      [2, 1, 0, 1, 2, 2, 2],
      [1, 1, 1],
      [2, 4, 4],
      [2, 1, 0, 1, 2, 2, 2],
      [2, 1, 1, 2, 1, 0],
    ]),
  },
  {
    id: 'oda-alegria',
    title: 'Oda a la alegría (Beethoven)',
    phrases: degrees([
      [2, 2, 3, 4, 4, 3, 2, 1],
      [0, 0, 1, 2, 2, 1, 1],
      [2, 2, 3, 4, 4, 3, 2, 1],
      [0, 0, 1, 2, 1, 0, 0],
    ]),
  },
  {
    id: 'estrellita',
    title: 'Estrellita, ¿dónde estás?',
    phrases: degrees([
      [0, 0, 4, 4, 5, 5, 4],
      [3, 3, 2, 2, 1, 1, 0],
      [4, 4, 3, 3, 2, 2, 1],
      [4, 4, 3, 3, 2, 2, 1],
      [0, 0, 4, 4, 5, 5, 4],
      [3, 3, 2, 2, 1, 1, 0],
    ]),
  },
  {
    id: 'au-clair',
    title: 'Au clair de la lune',
    phrases: degrees([
      [0, 0, 0, 1, 2, 1],
      [0, 2, 1, 1, 0],
      [0, 0, 0, 1, 2, 1],
      [0, 2, 1, 1, 0],
      [1, 1, 1, 1, -2, -2],
      [1, 0, -1, -2, -3],
      [0, 0, 0, 1, 2, 1],
      [0, 2, 1, 1, 0],
    ]),
  },
  {
    id: 'frere-jacques',
    title: 'Frère Jacques',
    phrases: degrees([
      [0, 1, 2, 0],
      [0, 1, 2, 0],
      [2, 3, 4],
      [2, 3, 4],
      [4, 5, 4, 3, 2, 0],
      [4, 5, 4, 3, 2, 0],
      [0, -3, 0],
      [0, -3, 0],
    ]),
  },
  {
    id: 'alouette',
    title: 'Alouette',
    phrases: written('C4 D4 E4 E4 / D4 C4 D4 E4 C4 G3 / C4 D4 E4 E4 / D4 C4 D4 E4 C4'),
  },
  {
    id: 'london-bridge',
    title: 'London Bridge',
    phrases: degrees([
      [4, 5, 4, 3, 2, 3, 4],
      [1, 2, 3],
      [2, 3, 4],
      [4, 5, 4, 3, 2, 3, 4],
      [1, 4, 2, 0],
    ]),
  },
  {
    id: 'old-macdonald',
    title: 'En la granja de mi tío',
    phrases: degrees([
      [0, 0, 0, -3, -2, -2, -3],
      [2, 2, 1, 1, 0],
      [0, 0, 0, -3, -2, -2, -3],
      [2, 2, 1, 1, 0],
    ]),
  },
  {
    id: 'cucaracha',
    title: 'La cucaracha',
    phrases: written(
      'G3 G3 G3 C4 E4 / G3 G3 G3 C4 E4 / C5 C5 B4 B4 A4 A4 G4 / G3 G3 G3 B3 D4 / G3 G3 G3 B3 D4 / G4 A4 G4 F4 E4 D4 C4',
    ),
  },
  {
    id: 'yankee-doodle',
    title: 'Yankee Doodle',
    phrases: written('C4 C4 D4 E4 C4 E4 D4 G3 / C4 C4 D4 E4 C4 B3 / C4 C4 D4 E4 F4 E4 D4 C4 / B3 G3 A3 B3 C4 C4'),
  },
  {
    id: 'oh-susanna',
    title: 'Oh! Susanna',
    phrases: degrees([
      [0, 1, 2, 4, 4, 5, 4, 2],
      [0, 1, 2, 2, 1, 0, 1],
      [0, 1, 2, 4, 4, 5, 4, 2],
      [0, 1, 2, 2, 1, 1, 0],
    ]),
  },
  {
    id: 'saints',
    title: 'When the Saints Go Marching In',
    phrases: degrees([
      [0, 2, 3, 4],
      [0, 2, 3, 4],
      [0, 2, 3, 4, 2, 0, 2, 1],
      [2, 2, 1, 0],
      [0, 2, 4, 4, 3],
      [2, 3, 4, 2, 0, 1, 0],
    ]),
  },
  {
    id: 'amazing-grace',
    title: 'Amazing Grace',
    phrases: written(
      'G3 C4 E4 C4 E4 / D4 C4 A3 G3 / G3 C4 E4 C4 E4 D4 G4 / E4 G4 E4 G4 E4 C4 G3 / A3 C4 C4 A3 G3 / G3 C4 E4 C4 E4 D4 C4',
    ),
  },
  {
    id: 'scarborough',
    title: 'Scarborough Fair',
    phrases: written(
      'D4 D4 A4 A4 / E4 F4 E4 D4 / A4 C5 D5 C5 A4 B4 G4 A4 / D5 D5 D5 C5 A4 / A4 G4 F4 E4 C4 / D4 A4 G4 F4 E4 D4 C4 D4',
    ),
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves',
    phrases: written('A4 C5 D5 E5 F5 E5 / D5 B4 G4 A4 B4 / C5 A4 A4 G#4 A4 / B4 G#4 E4'),
  },
  {
    id: 'noche-de-paz',
    title: 'Noche de paz',
    phrases: written(
      'G4 A4 G4 E4 / G4 A4 G4 E4 / D5 D5 B4 / C5 C5 G4 / A4 A4 C5 B4 A4 / G4 A4 G4 E4 / A4 A4 C5 B4 A4 / G4 A4 G4 E4 / D5 D5 F5 D5 B4 / C5 E5 / C5 G4 E4 G4 F4 D4 C4',
    ),
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells',
    phrases: degrees([
      [2, 2, 2],
      [2, 2, 2],
      [2, 4, 0, 1, 2],
      [3, 3, 3, 3, 3, 2, 2, 2],
      [2, 1, 1, 2, 1, 4],
      [2, 2, 2],
      [2, 2, 2],
      [2, 4, 0, 1, 2],
      [3, 3, 3, 3, 3, 2, 2, 2],
      [4, 4, 3, 1, 0],
    ]),
  },
  {
    id: 'joy-world',
    title: 'Joy to the World',
    phrases: degrees([
      [7, 6, 5, 4, 3, 2, 1, 0],
      [4, 5, 5, 6, 6, 7],
      [7, 7, 6, 5, 4, 4, 3, 2],
      [7, 7, 6, 5, 4, 4, 3, 2],
    ]),
  },
  {
    id: 'row-row',
    title: 'Row, Row, Row Your Boat',
    phrases: degrees([
      [0, 0, 0, 1, 2],
      [2, 1, 2, 3, 4],
      [7, 7, 7, 4, 4, 4],
      [2, 2, 2, 0, 0, 0],
      [4, 3, 2, 1, 0],
    ]),
  },
  {
    id: 'cumpleanos',
    title: 'Cumpleaños feliz',
    phrases: degrees([
      [-3, -3, -2, -3, 0, -1],
      [-3, -3, -2, -3, 1, 0],
      [-3, -3, 4, 2, 0, -1, -2],
      [3, 3, 2, 0, 1, 0],
    ]),
  },
  {
    id: 'cancion-de-cuna',
    title: 'Canción de cuna (Brahms)',
    phrases: written('E4 E4 G4 / E4 E4 G4 / E4 G4 C5 B4 A4 A4 G4 / D4 E4 F4 D4 / D4 E4 F4 / D4 F4 B4 A4 G4 B4 C5'),
  },
  {
    id: 'largo',
    title: 'Largo de la Sinfonía del Nuevo Mundo (Dvořák)',
    phrases: degrees([
      [2, 4, 4],
      [2, 1, 0],
      [1, 2, 4, 2, 1],
      [2, 4, 4],
      [2, 1, 0],
      [1, 2, 1, 0, 0],
    ]),
  },
  {
    id: 'la-manana',
    title: 'La mañana, de Peer Gynt (Grieg)',
    phrases: written('G4 E4 D4 C4 D4 E4 / G4 E4 D4 C4 D4 E4 / G4 E4 G4 A4 E4 A4 / G4 E4 D4 C4'),
  },
  {
    id: 'primavera',
    title: 'La primavera (Vivaldi)',
    phrases: written('C4 E4 E4 E4 D4 C4 G4 / G4 F4 E4 E4 E4 D4 C4 G4 / G4 F4 E4 F4 G4 F4 E4 D4'),
  },
  {
    id: 'para-elisa',
    title: 'Para Elisa (Beethoven)',
    phrases: written(
      'E5 D#5 E5 D#5 E5 / B4 D5 C5 A4 / C4 E4 A4 B4 / E4 G#4 B4 C5 / E5 D#5 E5 D#5 E5 / B4 D5 C5 A4 / C4 E4 A4 B4 / E4 C5 B4 A4',
    ),
  },
  {
    id: 'minueto-sol',
    title: 'Minueto en Sol (Petzold)',
    phrases: written(
      'D5 G4 A4 B4 C5 D5 G4 G4 / E5 C5 D5 E5 F#5 G5 G4 G4 / C5 D5 C5 B4 A4 / B4 C5 B4 A4 G4 / F#4 G4 A4 B4 G4 / B4 A4',
    ),
  },
  {
    id: 'serenata',
    title: 'Pequeña serenata nocturna (Mozart)',
    phrases: written('G4 D4 G4 D4 / G4 D4 G4 B4 D5 / C5 A4 C5 A4 / C5 A4 F#4 A4 D4'),
  },
  {
    id: 'sinfonia-40',
    title: 'Sinfonía n.º 40 (Mozart)',
    phrases: written('Eb5 D5 D5 / Eb5 D5 D5 / Eb5 D5 D5 Bb5 / Bb5 A5 G5 / G5 F5 Eb5 / Eb5 D5 C5 C5'),
  },
  {
    id: 'quinta',
    title: 'Quinta sinfonía (Beethoven)',
    phrases: written('G4 G4 G4 Eb4 / F4 F4 F4 D4 / G4 G4 G4 Eb4 / Ab4 Ab4 Ab4 G4 / Eb5 Eb5 Eb5 C5'),
  },
  {
    id: 'lago-cisnes',
    title: 'El lago de los cisnes (Chaikovski)',
    phrases: written('F#5 B4 C#5 D5 E5 / F#5 D5 F#5 D5 / F#5 B4 D5 B4 / G4 D5 B4'),
  },
];

/**
 * Coloca una melodía en la clave: la sube o baja por octavas hasta que cabe en el rango y el mayor
 * número de notas queda dentro del pentagrama. Devuelve null si no cabe en ninguna octava.
 */
export function fitSong(phrases: Pitch[][], clef: ClefId): Pitch[][] | null {
  const range = clefRange(clef);
  const low = range[0];
  const high = range[range.length - 1];
  const bottom = CLEFS[clef].bottomLine;
  const steps = phrases.flat().map((pitch) => pitch.step);
  let best: { shift: number; inside: number } | null = null;
  for (let octaves = -4; octaves <= 4; octaves++) {
    const shift = octaves * 7;
    if (steps.some((step) => step + shift < low || step + shift > high)) continue;
    const inside = steps.filter((step) => step + shift >= bottom && step + shift <= bottom + 8).length;
    if (!best || inside > best.inside) best = { shift, inside };
  }
  if (!best) return null;
  const shift = best.shift;
  return phrases.map((phrase) => phrase.map((pitch) => ({ step: pitch.step + shift, acc: pitch.acc })));
}
