import { CLEFS, CLEF_IDS } from './music/pitch';
import type { ClefId, Notation } from './music/pitch';
import type { Difficulty } from './music/phrases';
import { STAGES, initialNotes } from './music/program';
import type { DisplayMode, ExerciseKind } from './game/session';

/** Clave de un ejercicio manual: una de las cuatro o el pentagrama doble de piano. */
export type ManualClef = ClefId | 'grand';

export interface ManualConfig {
  kind: ExerciseKind;
  clef: ManualClef;
  /** Notas elegidas para los ejercicios con clave, por clave. */
  notes: Record<ClefId, number[]>;
  accidentals: boolean;
  /** Armadura: sostenidos (positivo) o bemoles (negativo). */
  keySignature: number;
  display: DisplayMode;
  /** Pulsos por minuto de la lectura con metrónomo. */
  bpm: number;
  difficulty: Difficulty;
  goal: number;
  timeLimit: number;
  survival: boolean;
  reference: boolean;
  maxInterval: number;
}

export type Theme = 'dark' | 'light';
/** Cómo se responde: tocando el teclado en pantalla o un piano real captado por el micrófono. */
export type InputMode = 'keys' | 'mic';

export interface Settings {
  notation: Notation;
  theme: Theme;
  sound: boolean;
  haptics: boolean;
  keyLabels: boolean;
  input: InputMode;
  manual: ManualConfig;
}

export interface NoteStat {
  seen: number;
  wrong: number;
  /** Tiempo de respuesta habitual en milisegundos (media móvil); 0 si aún no hay datos. */
  ms: number;
  /** Caja del repaso espaciado: cuanto más alta, más tarda en volver a tocar. */
  box: number;
  /** Día a partir del cual toca repasarla. */
  due: string;
  /** Último día en que subió de caja: como mucho una subida al día. */
  promoted: string;
}

export interface DailyResult {
  ms: number;
  wrong: number;
}

/** Lo practicado en un día, sumando todos los ejercicios. */
export interface DayStat {
  correct: number;
  wrong: number;
  ms: number;
}

/** Avance del modo inteligente en una clave. */
export interface JourneyState {
  /** Notas aprendidas, en el orden en que se añadieron. */
  added: number[];
  /** Siguiente ejercicio de la ronda; igual al número de ejercicios = ronda terminada. */
  stage: number;
  /** Mejor resultado en estrellas de cada ejercicio con el conjunto de notas actual. */
  stars: number[];
  /** Momento del último cambio, en milisegundos; 0 si nunca se ha tocado. */
  updated: number;
}

/** Canción añadida por el usuario; el texto usa el formato de letras y octavas. */
export interface CustomSong {
  id: string;
  title: string;
  text: string;
}

export interface Progress {
  journey: Record<ClefId, JourneyState>;
  notes: Record<ClefId, Record<number, NoteStat>>;
  daily: Record<string, DailyResult>;
  days: Record<string, DayStat>;
  /** Mejor resultado en estrellas de cada canción. */
  songs: Record<string, number>;
  /** Días en que se completó la sesión guiada. */
  sessions: Record<string, true>;
  customSongs: CustomSong[];
  /** Canciones propias borradas: se recuerdan para que no reaparezcan desde otro dispositivo. */
  deletedSongs: string[];
  /** Momento del último reinicio del progreso; 0 si nunca se ha reiniciado. */
  epoch: number;
}

const SETTINGS_KEY = 'srn.settings.v1';
const SYNC_KEY = 'srn.sync.v1';
const PROGRESS_KEY = 'srn.progress.v2';

// Repaso espaciado: días hasta el siguiente repaso según la caja.
const BOX_INTERVAL_DAYS = [0, 1, 2, 4, 8, 16];
// Una respuesta cuenta como fluida por debajo de este tiempo; solo las fluidas suben de caja.
const FLUENT_MS = 2500;
// Peso de la respuesta nueva en la media móvil del tiempo.
const TIME_SMOOTHING = 0.3;
// Tiempo a partir del cual una nota se considera lenta al repartir pesos.
const SLOW_MS = 1500;

function perClef<T>(make: (clef: ClefId) => T): Record<ClefId, T> {
  return Object.fromEntries(CLEF_IDS.map((clef) => [clef, make(clef)])) as Record<ClefId, T>;
}

/** Notas dentro del pentagrama (de la línea inferior a la superior). */
export function staffNotes(clef: ClefId): number[] {
  return Array.from({ length: 9 }, (_, pos) => CLEFS[clef].bottomLine + pos);
}

export function newJourney(clef: ClefId, added = initialNotes(clef), updated = 0): JourneyState {
  return { added, stage: 0, stars: STAGES.map(() => 0), updated };
}

export function defaultSettings(): Settings {
  return {
    notation: 'english',
    theme: 'dark',
    sound: true,
    haptics: true,
    keyLabels: true,
    input: 'keys',
    manual: {
      kind: 'absolute',
      clef: 'treble',
      notes: perClef(staffNotes),
      accidentals: false,
      keySignature: 0,
      display: 'static',
      bpm: 60,
      difficulty: 1,
      goal: 20,
      timeLimit: 0,
      survival: false,
      reference: false,
      maxInterval: 5,
    },
  };
}

export function defaultProgress(): Progress {
  return {
    journey: perClef((clef) => newJourney(clef)),
    notes: perClef(() => ({})),
    daily: {},
    days: {},
    songs: {},
    sessions: {},
    customSongs: [],
    deletedSongs: [],
    epoch: 0,
  };
}

function read<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento (modo privado): la app sigue funcionando sin guardar
  }
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  const saved = read<Settings>(SETTINGS_KEY);
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    manual: { ...base.manual, ...saved.manual, notes: { ...base.manual.notes, ...saved.manual?.notes } },
  };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

/** Completa un progreso guardado (quizá por una versión anterior) con lo que le falte. */
function normalizeProgress(saved: Partial<Progress>): Progress {
  const base = defaultProgress();
  const progress: Progress = {
    journey: { ...base.journey, ...saved.journey },
    notes: { ...base.notes, ...saved.notes },
    daily: { ...saved.daily },
    days: { ...saved.days },
    songs: { ...saved.songs },
    sessions: { ...saved.sessions },
    customSongs: [...(saved.customSongs ?? [])],
    deletedSongs: [...(saved.deletedSongs ?? [])],
    epoch: saved.epoch ?? 0,
  };
  // datos guardados por versiones anteriores: se completan los campos que no existían
  for (const clef of CLEF_IDS) {
    progress.journey[clef].updated ??= 0;
    for (const stat of Object.values(progress.notes[clef])) {
      stat.ms ??= 0;
      stat.box ??= 0;
      stat.due ??= '';
      stat.promoted ??= '';
    }
  }
  return progress;
}

export function loadProgress(): Progress {
  const saved = read<Progress>(PROGRESS_KEY);
  return saved ? normalizeProgress(saved) : defaultProgress();
}

export function saveProgress(progress: Progress): void {
  write(PROGRESS_KEY, progress);
}

export function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Anota una respuesta: precisión, tiempo habitual y cuándo toca repasar la nota. */
export function recordNote(progress: Progress, clef: ClefId, step: number, ok: boolean, ms: number, now: Date): void {
  const today = dateKey(now);
  const stat = (progress.notes[clef][step] ??= { seen: 0, wrong: 0, ms: 0, box: 0, due: today, promoted: '' });
  stat.seen++;
  stat.ms = stat.ms > 0 ? Math.round(stat.ms + (ms - stat.ms) * TIME_SMOOTHING) : Math.round(ms);
  if (!ok) {
    stat.wrong++;
    stat.box = 0;
  } else if (ms <= FLUENT_MS && stat.promoted !== today) {
    stat.box = Math.min(BOX_INTERVAL_DAYS.length - 1, stat.box + 1);
    stat.promoted = today;
  }
  stat.due = dateKey(addDays(now, BOX_INTERVAL_DAYS[stat.box]));
}

/** Peso de cada nota al generar ejercicios: más para las nuevas, las que se fallan y las lentas. */
export function noteWeights(progress: Progress, clef: ClefId, pool: number[], newNotes: number[]): Record<number, number> {
  const weights: Record<number, number> = {};
  for (const step of pool) {
    const stat = progress.notes[clef][step];
    const errorRate = stat && stat.seen >= 4 ? stat.wrong / stat.seen : 0;
    const slowness = stat && stat.seen >= 3 ? Math.max(1, Math.min(3, stat.ms / SLOW_MS)) : 1;
    weights[step] = (1 + 4 * errorRate) * slowness * (newNotes.includes(step) ? 3 : 1);
  }
  return weights;
}

/** Notas del conjunto a las que hoy les toca repaso, o que nunca se han practicado. */
export function dueNotes(progress: Progress, clef: ClefId, pool: number[], now: Date): number[] {
  const today = dateKey(now);
  return pool.filter((step) => {
    const stat = progress.notes[clef][step];
    return !stat || stat.due <= today;
  });
}

/** Las `count` notas del conjunto con peor tiempo de respuesta; las no practicadas van primero. */
export function slowestNotes(progress: Progress, clef: ClefId, pool: number[], count: number): number[] {
  const time = (step: number) => {
    const stat = progress.notes[clef][step];
    return stat && stat.seen > 0 ? stat.ms : Infinity;
  };
  return [...pool].sort((a, b) => time(b) - time(a)).slice(0, count);
}

/** Suma un ejercicio a lo practicado en el día. */
export function recordDay(progress: Progress, now: Date, correct: number, wrong: number, ms: number): void {
  const day = (progress.days[dateKey(now)] ??= { correct: 0, wrong: 0, ms: 0 });
  day.correct += correct;
  day.wrong += wrong;
  day.ms += Math.round(ms);
}

export interface WeekStat extends DayStat {
  /** Lunes de la semana. */
  start: string;
}

/** Lo practicado en las últimas `count` semanas (de lunes a domingo), de la más antigua a la actual. */
export function weeklyStats(progress: Progress, now: Date, count: number): WeekStat[] {
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const weeks: WeekStat[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const start = addDays(monday, -7 * back);
    const week: WeekStat = { start: dateKey(start), correct: 0, wrong: 0, ms: 0 };
    for (let d = 0; d < 7; d++) {
      const day = progress.days[dateKey(addDays(start, d))];
      if (!day) continue;
      week.correct += day.correct;
      week.wrong += day.wrong;
      week.ms += day.ms;
    }
    weeks.push(week);
  }
  return weeks;
}

/** Días seguidos, contando hoy o, si aún falta, hasta ayer, en que existe una entrada en `done`. */
export function streakOf(done: Record<string, unknown>, today: Date): number {
  let day = new Date(today);
  if (!done[dateKey(day)]) day = addDays(day, -1);
  let streak = 0;
  while (done[dateKey(day)]) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

// Cada fallo del reto diario equivale a este tiempo al comparar dos resultados.
const DAILY_MISTAKE_PENALTY_MS = 3000;

/** Puntuación de un reto diario: cuanto más baja, mejor. */
export function dailyScore(result: DailyResult): number {
  return result.ms + result.wrong * DAILY_MISTAKE_PENALTY_MS;
}

/**
 * Une dos copias del progreso, por ejemplo la de este dispositivo y la de otro. De cada dato se
 * queda la versión más avanzada, así que combinar dos veces lo mismo no cambia nada ni duplica
 * cuentas: es seguro importar la misma copia varias veces o en cualquier orden.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  // Reiniciar el progreso abre una época nueva: lo anterior no vuelve aunque otro dispositivo aún lo tenga.
  if (a.epoch !== b.epoch) return a.epoch > b.epoch ? a : b;

  const out = defaultProgress();
  out.epoch = a.epoch;
  for (const clef of CLEF_IDS) {
    const ja = a.journey[clef];
    const jb = b.journey[clef];
    // Modo inteligente: gana el cambio más reciente (así quitar una nota no se deshace desde el otro
    // dispositivo); sin fechas que comparar, el que más ha avanzado.
    const bAhead = jb.added.length > ja.added.length || (jb.added.length === ja.added.length && jb.stage > ja.stage);
    const bWins = jb.updated !== ja.updated ? jb.updated > ja.updated : bAhead;
    out.journey[clef] = bWins ? jb : ja;

    const steps = new Set([...Object.keys(a.notes[clef]), ...Object.keys(b.notes[clef])].map(Number));
    for (const step of steps) {
      const sa = a.notes[clef][step];
      const sb = b.notes[clef][step];
      out.notes[clef][step] = !sa || (sb && sb.seen > sa.seen) ? sb : sa;
    }
  }
  for (const date of new Set([...Object.keys(a.daily), ...Object.keys(b.daily)])) {
    const da = a.daily[date];
    const db = b.daily[date];
    out.daily[date] = !da || (db && dailyScore(db) < dailyScore(da)) ? db : da;
  }
  for (const date of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) {
    const da = a.days[date];
    const db = b.days[date];
    out.days[date] = !da || (db && db.correct + db.wrong > da.correct + da.wrong) ? db : da;
  }
  out.sessions = { ...a.sessions, ...b.sessions };

  // Una canción propia borrada en un dispositivo queda borrada en todos.
  out.deletedSongs = [...new Set([...a.deletedSongs, ...b.deletedSongs])];
  out.customSongs = [...a.customSongs, ...b.customSongs.filter((song) => !a.customSongs.some((mine) => mine.id === song.id))].filter(
    (song) => !out.deletedSongs.includes(song.id),
  );
  for (const id of new Set([...Object.keys(a.songs), ...Object.keys(b.songs)])) {
    if (!out.deletedSongs.includes(id)) out.songs[id] = Math.max(a.songs[id] ?? 0, b.songs[id] ?? 0);
  }
  return out;
}

const BACKUP_APP = 'lectura-notas';

/** Texto de la copia de seguridad, para guardarlo en un archivo. */
export function exportBackup(progress: Progress, now: Date): string {
  return JSON.stringify({ app: BACKUP_APP, version: 1, exported: now.toISOString(), progress });
}

/** Lee una copia de seguridad; devuelve null si el archivo no es de esta app. */
export function importBackup(text: string): Progress | null {
  try {
    const data = JSON.parse(text) as { app?: string; progress?: Partial<Progress> };
    if (data.app !== BACKUP_APP || typeof data.progress !== 'object' || data.progress === null) return null;
    return normalizeProgress(data.progress);
  } catch {
    return null;
  }
}

/** Si este dispositivo tiene activada la sincronización (alguien inició sesión en él). */
export function syncEnabled(): boolean {
  try {
    return localStorage.getItem(SYNC_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSyncEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(SYNC_KEY, '1');
    else localStorage.removeItem(SYNC_KEY);
  } catch {
    // sin almacenamiento: habrá que iniciar sesión cada vez
  }
}
