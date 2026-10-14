// Una altura se guarda como "paso diatónico" (octava * 7 + letra, con Do = 0) más una alteración.
// Así la posición en el pentagrama es una simple resta y no depende de los semitonos.

export type Accidental = -1 | 0 | 1;

export interface Pitch {
  step: number;
  acc: Accidental;
}

const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

export const MIDDLE_C = 28; // Do4

export function letterOf(step: number): number {
  return ((step % 7) + 7) % 7;
}

export function octaveOf(step: number): number {
  return Math.floor(step / 7);
}

export function midiOf(p: Pitch): number {
  return 12 * (octaveOf(p.step) + 1) + LETTER_SEMITONES[letterOf(p.step)] + p.acc;
}

export function pitchClassOf(p: Pitch): number {
  return ((midiOf(p) % 12) + 12) % 12;
}

/** Clase de altura (0-11) de cada tecla blanca, de Do a Si. */
export const WHITE_PCS = LETTER_SEMITONES;

export type ClefId = 'treble' | 'bass' | 'alto' | 'tenor';

export interface ClefDef {
  id: ClefId;
  label: string;
  /** Glifo SMuFL de la clave. */
  glyph: string;
  /** Posición (0 = línea inferior, 8 = línea superior) sobre la que se asienta el glifo. */
  glyphPos: number;
  /** Paso diatónico de la línea inferior del pentagrama. */
  bottomLine: number;
  /** Nota que señala la clave: punto de partida del modo inteligente. */
  anchor: number;
}

export const CLEFS: Record<ClefId, ClefDef> = {
  treble: { id: 'treble', label: 'Sol', glyph: '', glyphPos: 2, bottomLine: 30, anchor: 32 },
  bass: { id: 'bass', label: 'Fa', glyph: '', glyphPos: 6, bottomLine: 18, anchor: 24 },
  alto: { id: 'alto', label: 'Do en 3ª (alto)', glyph: '', glyphPos: 4, bottomLine: 24, anchor: 28 },
  tenor: { id: 'tenor', label: 'Do en 4ª (tenor)', glyph: '', glyphPos: 6, bottomLine: 22, anchor: 28 },
};

export const CLEF_IDS: ClefId[] = ['treble', 'bass', 'alto', 'tenor'];

/** Rango de posiciones que usa la app: hasta dos líneas adicionales por arriba y por abajo. */
export const MIN_POS = -4;
export const MAX_POS = 12;

export function clefRange(clef: ClefId): number[] {
  const base = CLEFS[clef].bottomLine;
  const steps: number[] = [];
  for (let pos = MIN_POS; pos <= MAX_POS; pos++) steps.push(base + pos);
  return steps;
}

export type Notation = 'solfege' | 'english' | 'german';

const LETTER_NAMES: Record<Notation, string[]> = {
  solfege: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'],
  english: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  german: ['C', 'D', 'E', 'F', 'G', 'A', 'H'],
};

const GERMAN_FLATS = ['Ces', 'Des', 'Es', 'Fes', 'Ges', 'As', 'B'];

export function letterName(letter: number, notation: Notation): string {
  return LETTER_NAMES[notation][letter];
}

export function noteName(p: Pitch, notation: Notation): string {
  const letter = letterOf(p.step);
  if (notation === 'german') {
    if (p.acc === 1) return LETTER_NAMES.german[letter] + 'is';
    if (p.acc === -1) return GERMAN_FLATS[letter];
    return LETTER_NAMES.german[letter];
  }
  const sign = p.acc === 1 ? '♯' : p.acc === -1 ? '♭' : '';
  return LETTER_NAMES[notation][letter] + sign;
}

/** Nombre con octava, para listas donde la misma nota aparece en varias alturas. */
export function noteNameWithOctave(step: number, notation: Notation): string {
  return `${letterName(letterOf(step), notation)}${octaveOf(step)}`;
}

// Armaduras. El número indica cuántos sostenidos (positivo) o bemoles (negativo) lleva.
// Se limita a cinco para no llegar a Mi♯, Si♯, Do♭ ni Fa♭, que suenan como teclas blancas.
export const MAX_KEY_SIGNATURE = 5;

// Orden en que aparecen las alteraciones, como letras (Do = 0).
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

// Posición en el pentagrama de cada alteración de la armadura, según la clave.
const SHARP_POSITIONS: Record<ClefId, number[]> = {
  treble: [8, 5, 9, 6, 3, 7, 4],
  bass: [6, 3, 7, 4, 1, 5, 2],
  alto: [7, 4, 8, 5, 2, 6, 3],
  tenor: [2, 6, 3, 7, 4, 8, 5],
};
const FLAT_POSITIONS: Record<ClefId, number[]> = {
  treble: [4, 7, 3, 6, 2, 5, 1],
  bass: [2, 5, 1, 4, 0, 3, -1],
  alto: [3, 6, 2, 5, 1, 4, 0],
  tenor: [5, 8, 4, 7, 3, 6, 2],
};

/** Alteración que la armadura impone a una letra. */
export function keyAccidental(letter: number, signature: number): Accidental {
  if (signature > 0 && SHARP_ORDER.slice(0, signature).includes(letter)) return 1;
  if (signature < 0 && FLAT_ORDER.slice(0, -signature).includes(letter)) return -1;
  return 0;
}

export function keySignaturePositions(clef: ClefId, signature: number): number[] {
  return signature >= 0 ? SHARP_POSITIONS[clef].slice(0, signature) : FLAT_POSITIONS[clef].slice(0, -signature);
}

/** Nombre de la tonalidad mayor que corresponde a la armadura. */
export function keyName(signature: number, notation: Notation): string {
  // cada sostenido sube la tónica una quinta (4 letras); cada bemol la baja
  const letter = (((signature * 4) % 7) + 7) % 7;
  return noteName({ step: letter, acc: keyAccidental(letter, signature) }, notation);
}

/** Número de intervalo entre dos pasos (2 = segunda, 8 = octava). */
export function intervalNumber(a: number, b: number): number {
  return Math.abs(a - b) + 1;
}
