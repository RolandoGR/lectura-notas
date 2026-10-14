import { CLEFS, MAX_POS, MIDDLE_C, MIN_POS, intervalNumber, keyAccidental, letterOf, pitchClassOf } from '../music/pitch';
import type { Accidental, ClefId, Pitch } from '../music/pitch';
import { melodyPhrase, mulberry32, walkPhrase } from '../music/phrases';
import type { Difficulty, Rng } from '../music/phrases';

/** absolute = con clave, relative = sin clave (se da la primera nota), interval = intervalos. */
export type ExerciseKind = 'absolute' | 'relative' | 'interval';
/** static = grupos fijos, moving = en movimiento, hidden = de memoria, pulse = con metrónomo. */
export type DisplayMode = 'static' | 'moving' | 'hidden' | 'pulse';
export type FinishReason = 'goal' | 'lives' | 'time';

export interface SessionConfig {
  kind: ExerciseKind;
  clef: ClefId;
  /** Pasos permitidos en los ejercicios con clave, en orden ascendente. */
  pool: number[];
  accidentals: boolean;
  display: DisplayMode;
  difficulty: Difficulty;
  /** Aciertos necesarios para terminar; 0 = sin objetivo. */
  goal: number;
  /** Límite de tiempo en segundos; 0 = sin límite. */
  timeLimit: number;
  /** Vidas en modo supervivencia; 0 = desactivado. */
  lives: number;
  reference: boolean;
  /** Mayor intervalo que puede aparecer (5, 7 u 8). */
  maxInterval: number;
  seed: number;
  /** Peso de cada paso al elegir notas: sirve para insistir en las que más se fallan. */
  weights?: Record<number, number>;
  /** Pentagrama doble: clave de Sol y de Fa a la vez; `pool` reúne las notas de las dos. */
  grand?: boolean;
  /** Armadura: número de sostenidos (positivo) o bemoles (negativo). */
  keySignature?: number;
  /** Pulsos por minuto del modo con metrónomo. */
  bpm?: number;
  /** Canción: frases fijas, en orden; al tocar la última nota termina el ejercicio. */
  song?: Pitch[][];
}

export interface Item {
  pitch: Pitch;
  /** Segunda nota del par, solo en intervalos. */
  second?: Pitch;
  phrase: number;
  /** Nota dada como punto de partida (ejercicios sin clave): no se responde. */
  given: boolean;
  /** Clave del pentagrama donde se dibuja; null si el ejercicio no usa clave. */
  clef: ClefId | null;
  /** Paso de la línea inferior con el que se dibuja esta nota. */
  bottomLine: number;
  result: 'pending' | 'correct' | 'wrong';
}

export interface AnswerResult {
  item: Item;
  correct: boolean;
  expected: number;
}

// Notas por grupo. En lectura normal los grupos varían de tamaño, como frases de distinta longitud;
// con notas ocultas son cortos porque hay que retenerlos de memoria.
const GROUP_SIZE: [number, number] = [2, 7];
const HIDDEN_GROUP_SIZE: Record<Difficulty, [number, number]> = { 1: [1, 2], 2: [2, 3], 3: [3, 4] };
const RELATIVE_GROUP_SIZE: [number, number] = [4, 7];
const INTERVALS_PER_PAGE = 4;
const MELODY_CHANCE = 0.3;
const ACCIDENTAL_CHANCE = 0.25;

// Rango de posiciones según la dificultad para los ejercicios que no dependen de una clave.
const POS_RANGE: Record<Difficulty, [number, number]> = {
  1: [0, 8],
  2: [-2, 10],
  3: [MIN_POS, MAX_POS],
};

export class Session {
  readonly config: SessionConfig;
  readonly items: Item[] = [];
  cursor = 0;
  correct = 0;
  wrong = 0;
  lives: number;
  finished: FinishReason | null = null;
  /** Fallos por paso diatónico, para el resumen final. */
  readonly mistakes = new Map<number, number>();
  /** Aciertos y fallos por nombre de nota (Do = 0 … Si = 6). */
  readonly letters = Array.from({ length: 7 }, () => ({ seen: 0, wrong: 0 }));

  private readonly rng: Rng;
  private phraseCount = 0;
  private lastStep: number | undefined;

  constructor(config: SessionConfig) {
    this.config = config;
    this.lives = config.lives;
    this.rng = mulberry32(config.seed);
    this.ensure(1);
    this.skipGiven();
  }

  get current(): Item | undefined {
    return this.finished ? undefined : this.items[this.cursor];
  }

  /** Respuesta esperada: clase de altura (0-11) o número de intervalo. */
  expected(item: Item): number {
    if (item.second) return intervalNumber(item.pitch.step, item.second.step);
    return pitchClassOf(item.pitch);
  }

  answer(value: number): AnswerResult | null {
    const item = this.current;
    if (!item) return null;
    const expected = this.expected(item);
    const correct = value === expected;
    this.resolve(item, correct ? 'correct' : 'wrong');
    return { item, correct, expected };
  }

  /** La nota pasó sin respuesta (modo con metrónomo): cuenta como fallo y se sigue adelante. */
  skip(): Item | null {
    const item = this.current;
    if (!item) return null;
    this.resolve(item, 'wrong');
    return item;
  }

  timeUp(): void {
    if (!this.finished) this.finished = 'time';
  }

  /** Genera notas hasta tener `count` a partir del cursor, o hasta que se acabe la canción. */
  ensure(count: number): void {
    while (this.items.length < this.cursor + count && this.addPhrase());
  }

  phraseItems(phrase: number): { item: Item; index: number }[] {
    const out: { item: Item; index: number }[] = [];
    this.items.forEach((item, index) => {
      if (item.phrase === phrase) out.push({ item, index });
    });
    return out;
  }

  private resolve(item: Item, result: 'correct' | 'wrong'): void {
    item.result = result;
    if (!item.second) {
      const stat = this.letters[letterOf(item.pitch.step)];
      stat.seen++;
      if (result !== 'correct') stat.wrong++;
    }
    if (result === 'correct') {
      this.correct++;
    } else {
      this.wrong++;
      this.mistakes.set(item.pitch.step, (this.mistakes.get(item.pitch.step) ?? 0) + 1);
      if (this.config.lives > 0) this.lives--;
    }

    if (this.config.lives > 0 && this.lives <= 0) this.finished = 'lives';
    else if (this.config.goal > 0 && this.correct >= this.config.goal) this.finished = 'goal';

    this.cursor++;
    if (!this.finished) {
      this.ensure(1);
      this.skipGiven();
      // una canción termina al tocar su última nota
      if (this.cursor >= this.items.length) this.finished = 'goal';
    }
  }

  private skipGiven(): void {
    while (this.items[this.cursor]?.given) {
      this.cursor++;
      this.ensure(1);
    }
  }

  /** Añade el siguiente grupo; devuelve false si ya no quedan (final de una canción). */
  private addPhrase(): boolean {
    if (this.config.song && this.phraseCount >= this.config.song.length) return false;
    const phrase = this.phraseCount++;
    if (this.config.kind === 'interval') this.addIntervals(phrase);
    else if (this.config.kind === 'relative') this.addRelative(phrase);
    else this.addAbsolute(phrase);
    return true;
  }

  private addAbsolute(phrase: number): void {
    const { pool, difficulty, weights, accidentals, display, song } = this.config;
    if (song) {
      for (const pitch of song[phrase]) this.pushNote(pitch.step, pitch.acc, phrase);
      return;
    }
    const signature = this.config.keySignature ?? 0;
    const hidden = display === 'hidden';
    const length = this.groupLength(hidden ? HIDDEN_GROUP_SIZE[difficulty] : GROUP_SIZE);
    let steps: number[] | null = null;
    // los fragmentos de melodía están escritos en Do mayor: con armadura no se usan
    if (!hidden && signature === 0 && pool.length >= 5 && this.rng() < MELODY_CHANCE) {
      steps = melodyPhrase(pool, this.rng);
    }
    const isMelody = steps !== null;
    steps ??= walkPhrase({
      pool,
      length,
      difficulty,
      rng: this.rng,
      weightOf: weights ? (step) => weights[step] ?? 1 : undefined,
      from: this.lastStep,
    });
    this.lastStep = steps[steps.length - 1];

    for (const step of steps) {
      let acc: Accidental = keyAccidental(letterOf(step), signature);
      if (accidentals && signature === 0 && !isMelody) acc = this.randomAccidental(step);
      this.pushNote(step, acc, phrase);
    }
  }

  private pushNote(step: number, acc: Accidental, phrase: number): void {
    const clef = this.clefFor(step);
    this.items.push({ pitch: { step, acc }, phrase, given: false, clef, bottomLine: CLEFS[clef].bottomLine, result: 'pending' });
  }

  /** En el pentagrama doble, del Do central hacia arriba va en clave de Sol y lo demás en clave de Fa. */
  private clefFor(step: number): ClefId {
    if (!this.config.grand) return this.config.clef;
    if (step === MIDDLE_C) return this.rng() < 0.5 ? 'treble' : 'bass';
    return step > MIDDLE_C ? 'treble' : 'bass';
  }

  private addRelative(phrase: number): void {
    const [low, high] = POS_RANGE[this.config.difficulty];
    // Sin clave, cualquier nota puede caer en la línea inferior: se sortea en cada frase.
    const bottomLine = 18 + Math.floor(this.rng() * 17);
    const pool: number[] = [];
    for (let pos = low; pos <= high; pos++) pool.push(bottomLine + pos);
    const length = this.groupLength(RELATIVE_GROUP_SIZE);
    const steps = walkPhrase({ pool, length, difficulty: this.config.difficulty, rng: this.rng });
    steps.forEach((step, i) => {
      this.items.push({ pitch: { step, acc: 0 }, phrase, given: i === 0, clef: null, bottomLine, result: 'pending' });
    });
  }

  private addIntervals(phrase: number): void {
    const bottomLine = CLEFS.treble.bottomLine;
    const [low, high] = POS_RANGE[this.config.difficulty];
    for (let i = 0; i < INTERVALS_PER_PAGE; i++) {
      const size = 1 + Math.floor(this.rng() * (this.config.maxInterval - 1));
      const first = low + Math.floor(this.rng() * (high - low + 1));
      let second = this.rng() < 0.5 ? first + size : first - size;
      if (second > MAX_POS) second = first - size;
      if (second < MIN_POS) second = first + size;
      this.items.push({
        pitch: { step: bottomLine + first, acc: 0 },
        second: { step: bottomLine + second, acc: 0 },
        phrase,
        given: false,
        clef: null,
        bottomLine,
        result: 'pending',
      });
    }
  }

  private groupLength([min, max]: [number, number]): number {
    return min + Math.floor(this.rng() * (max - min + 1));
  }

  private randomAccidental(step: number): Accidental {
    if (this.rng() >= ACCIDENTAL_CHANCE) return 0;
    const letter = letterOf(step);
    const sharp = this.rng() < 0.5;
    // Se evitan Mi♯, Si♯, Do♭ y Fa♭: suenan como una tecla blanca y confunden al empezar.
    if (sharp) return letter === 2 || letter === 6 ? -1 : 1;
    return letter === 0 || letter === 3 ? 1 : -1;
  }
}
