import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { CLEFS, CLEF_IDS, MAX_KEY_SIGNATURE, clefRange, keyName, letterName, noteNameWithOctave } from '../music/pitch';
import type { ClefId, Notation } from '../music/pitch';
import type { Difficulty } from '../music/phrases';
import { STAGES, nextChoices } from '../music/program';
import { SONGS, fitSong, parseSong } from '../music/songs';
import type { Song } from '../music/songs';
import type { DisplayMode, ExerciseKind } from '../game/session';
import { dateKey, exportBackup, importBackup, mergeProgress, staffNotes, streakOf, weeklyStats } from '../storage';
import type { DailyResult, InputMode, JourneyState, ManualClef, ManualConfig, NoteStat, Progress, Settings, Theme } from '../storage';
import type { Summary } from './Exercise';
import { MiniStaff } from './Staff';
import { Field, Page, Segmented, Toggle } from './controls';
import { BulbIcon, ChartIcon, CloseIcon, GearIcon, MusicIcon, SlidersIcon, SunIcon, TrophyIcon } from './icons';

const CLEF_OPTIONS = CLEF_IDS.map((clef) => ({ value: clef, label: CLEFS[clef].label }));

function formatTime(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function Stars({ count }: { count: number }) {
  return (
    <span class="stars" aria-label={`${count} de 3 estrellas`}>
      {[1, 2, 3].map((n) => (
        <span class={n <= count ? 'star star-on' : 'star'} style={{ '--i': n - 1 }}>
          ★
        </span>
      ))}
    </span>
  );
}

/** Cuenta desde cero hasta el valor, frenando al final, para que la cifra «llegue» en vez de aparecer. */
function useCountUp(target: number, ms = 800): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - startedAt) / ms);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

const CONFETTI_PIECES = 44;

/** Lluvia de papelitos con los colores de las notas; solo para los resultados de tres estrellas. */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_PIECES }, (_, i) => ({
        left: Math.random() * 100,
        drift: (Math.random() - 0.5) * 180,
        spin: 360 + Math.random() * 720,
        delay: Math.random() * 0.6,
        duration: 1.7 + Math.random() * 1.3,
        hue: i % 7,
      })),
    [],
  );
  return (
    <div class="confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          style={{
            left: `${piece.left}%`,
            background: `var(--note-${piece.hue})`,
            '--drift': `${piece.drift}px`,
            '--spin': `${piece.spin}deg`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

interface ModeCardProps {
  tone: string;
  icon: ComponentChildren;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}

function ModeCard({ tone, icon, title, text, action, onClick }: ModeCardProps) {
  return (
    <button type="button" class={`card tone-${tone}`} onClick={onClick}>
      <span class="card-icon">{icon}</span>
      <span class="card-title">{title}</span>
      <span class="card-text">{text}</span>
      <span class="card-action">{action}</span>
    </button>
  );
}

function daysText(count: number): string {
  return `${count} ${count === 1 ? 'día' : 'días'}`;
}

interface HomeProps {
  progress: Progress;
  chapter: number;
  onSession: () => void;
  onJourney: () => void;
  onManual: () => void;
  onSongs: () => void;
  onDaily: () => void;
  onProgress: () => void;
  onSettings: () => void;
}

export function Home({ progress, chapter, onSession, onJourney, onManual, onSongs, onDaily, onProgress, onSettings }: HomeProps) {
  const now = new Date();
  const today = dateKey(now);
  const daily: DailyResult | undefined = progress.daily[today];
  const sessionDone = progress.sessions[today] === true;
  const sessionStreak = streakOf(progress.sessions, now);
  const dailyStreak = streakOf(progress.daily, now);
  const songsDone = SONGS.filter((song) => (progress.songs[song.id] ?? 0) > 0).length;
  return (
    <div class="page page-wide">
      <header class="home-header">
        <h1 class="brand">
          Lectura <span>de notas</span>
        </h1>
        <button type="button" class="icon-button" onClick={onSettings} aria-label="Ajustes">
          <GearIcon />
        </button>
      </header>
      <div class="cards">
        <ModeCard
          tone="session"
          icon={<SunIcon />}
          title="Sesión de hoy"
          text={
            (sessionDone ? 'Hecha. ' : 'Cinco minutos: calentamiento, nota nueva, repaso y pulso. ') +
            (sessionStreak > 0 ? `Racha: ${daysText(sessionStreak)}.` : '')
          }
          action={sessionDone ? 'Repetir' : 'Empezar'}
          onClick={onSession}
        />
        <ModeCard
          tone="smart"
          icon={<BulbIcon />}
          title="Modo inteligente"
          text={`Capítulo ${chapter}. Cuatro ejercicios por ronda y tú eliges la siguiente nota.`}
          action="Continuar"
          onClick={onJourney}
        />
        <ModeCard
          tone="manual"
          icon={<SlidersIcon />}
          title="Modo manual"
          text="Clave o pentagrama doble, armadura, metrónomo, notas y más."
          action="Configurar"
          onClick={onManual}
        />
        <ModeCard
          tone="songs"
          icon={<MusicIcon />}
          title="Canciones"
          text={`Melodías conocidas y las que tú añadas. ${songsDone} de ${SONGS.length} completadas.`}
          action="Elegir"
          onClick={onSongs}
        />
        <ModeCard
          tone="daily"
          icon={<TrophyIcon />}
          title="Reto diario"
          text={
            (daily ? `Hecho hoy en ${formatTime(daily.ms)} con ${daily.wrong} fallos.` : 'Un ejercicio nuevo cada día.') +
            (dailyStreak > 0 ? ` Racha: ${daysText(dailyStreak)}.` : '')
          }
          action={daily ? 'Mejorar marca' : 'Jugar'}
          onClick={onDaily}
        />
        <ModeCard
          tone="progress"
          icon={<ChartIcon />}
          title="Progreso"
          text="Tu dominio de cada nota sobre el pentagrama y tu evolución por semanas."
          action="Ver"
          onClick={onProgress}
        />
      </div>
    </div>
  );
}

interface JourneyProps {
  state: JourneyState;
  notation: Notation;
  clef: ClefId;
  onClef: (clef: ClefId) => void;
  onPlay: (stage: number) => void;
  onChoose: () => void;
  onAdd: (step: number) => void;
  onRemoveLast: () => void;
  onBack: () => void;
}

const STAGE_TONES = ['fixed', 'moving', 'memory', 'pulse'];

export function Journey({ state, notation, clef, onClef, onPlay, onChoose, onAdd, onRemoveLast, onBack }: JourneyProps) {
  const notes = [...state.added].sort((a, b) => a - b);
  const newest = state.added.length > 3 ? [state.added[state.added.length - 1]] : [];
  const { lower, upper } = nextChoices(clef, notes);
  const roundDone = state.stage >= STAGES.length;
  return (
    <Page title="Modo inteligente" onBack={onBack}>
      <Field label="Clave">
        <Segmented options={CLEF_OPTIONS} value={clef} onChange={onClef} />
      </Field>

      <section class="panel tone-smart">
        <div class="panel-head">
          <span class="ribbon">Capítulo {state.added.length - 2}</span>
          <span class="panel-note">{notes.length} notas</span>
        </div>
        <MiniStaff clef={clef} steps={notes} highlight={newest} />
        <div class="presets">
          {lower !== null && (
            <button type="button" class="chip" onClick={() => onAdd(lower)}>
              + {noteNameWithOctave(lower, notation)} (grave)
            </button>
          )}
          {upper !== null && (
            <button type="button" class="chip" onClick={() => onAdd(upper)}>
              + {noteNameWithOctave(upper, notation)} (aguda)
            </button>
          )}
          {state.added.length > 3 && (
            <button type="button" class="chip" onClick={onRemoveLast}>
              − Quitar la última
            </button>
          )}
        </div>
      </section>

      <div class="stages">
        {STAGES.map((stage, i) => (
          <button type="button" class={`stage tone-${STAGE_TONES[i]}`} onClick={() => onPlay(i)}>
            <span class="stage-number">{i + 1}</span>
            <span class="stage-body">
              <span class="stage-title">{stage.title}</span>
              <span class="stage-hint">
                {stage.goal} aciertos · {stage.hint}
              </span>
            </span>
            <Stars count={state.stars[i] ?? 0} />
          </button>
        ))}
      </div>

      {roundDone ? (
        <button type="button" class="primary" onClick={onChoose}>
          Elegir la siguiente nota
        </button>
      ) : (
        <button type="button" class="primary" onClick={() => onPlay(state.stage)}>
          Continuar: {STAGES[state.stage].title}
        </button>
      )}
    </Page>
  );
}

interface ChooseNoteProps {
  clef: ClefId;
  state: JourneyState;
  notation: Notation;
  /** null = seguir con las mismas notas. */
  onConfirm: (step: number | null) => void;
  onBack: () => void;
}

export function ChooseNote({ clef, state, notation, onConfirm, onBack }: ChooseNoteProps) {
  const { lower, upper } = nextChoices(clef, state.added);
  const options = [lower, upper].filter((step): step is number => step !== null);
  const [selected, setSelected] = useState<number | null>(options[0] ?? null);
  return (
    <Page title="¿Qué nota quieres aprender ahora?" onBack={onBack}>
      <div class="choices">
        {options.map((step) => (
          <button
            type="button"
            class={`choice${selected === step ? ' choice-on' : ''}`}
            aria-pressed={selected === step}
            onClick={() => setSelected(step)}
          >
            <MiniStaff clef={clef} steps={[step]} />
            <span class="choice-name">{noteNameWithOctave(step, notation)}</span>
          </button>
        ))}
        <button
          type="button"
          class={`choice choice-same${selected === null ? ' choice-on' : ''}`}
          aria-pressed={selected === null}
          onClick={() => setSelected(null)}
        >
          <span class="choice-name">Seguir con las mismas notas</span>
        </button>
      </div>
      <button type="button" class="primary" onClick={() => onConfirm(selected)}>
        Confirmar
      </button>
    </Page>
  );
}

interface ManualProps {
  manual: ManualConfig;
  notation: Notation;
  onChange: (manual: ManualConfig) => void;
  onStart: () => void;
  onBack: () => void;
}

const MANUAL_CLEF_OPTIONS: { value: ManualClef; label: string }[] = [...CLEF_OPTIONS, { value: 'grand', label: 'Doble (piano)' }];

const KEY_SIGNATURES = Array.from({ length: MAX_KEY_SIGNATURE * 2 + 1 }, (_, i) => i - MAX_KEY_SIGNATURE);

function signatureLabel(signature: number): string {
  if (signature === 0) return 'Ninguna';
  return signature > 0 ? `${signature} ♯` : `${-signature} ♭`;
}

export function Manual({ manual, notation, onChange, onStart, onBack }: ManualProps) {
  const set = <K extends keyof ManualConfig>(key: K, value: ManualConfig[K]) => onChange({ ...manual, [key]: value });
  const { kind } = manual;
  const grand = manual.clef === 'grand';
  const clef: ClefId = manual.clef === 'grand' ? 'treble' : manual.clef;
  const range = clefRange(clef);
  const selected = manual.notes[clef];
  const setNotes = (notes: number[]) => set('notes', { ...manual.notes, [clef]: [...notes].sort((a, b) => a - b) });
  const toggleNote = (step: number) =>
    setNotes(selected.includes(step) ? selected.filter((s) => s !== step) : [...selected, step]);
  const bottom = CLEFS[clef].bottomLine;
  const grandCount = manual.notes.treble.length + manual.notes.bass.length;
  const canStart = kind !== 'absolute' || (grand ? grandCount : selected.length) >= 2;

  // Sin clave solo se lee en grupos o de memoria; los intervalos, siempre en grupos fijos.
  const streamOnly = manual.display === 'moving' || manual.display === 'pulse';
  const display: DisplayMode = kind === 'interval' || (kind === 'relative' && streamOnly) ? 'static' : manual.display;

  return (
    <Page title="Modo manual" onBack={onBack}>
      <Field label="Ejercicio">
        <Segmented<ExerciseKind>
          options={[
            { value: 'absolute', label: 'Con clave' },
            { value: 'relative', label: 'Sin clave' },
            { value: 'interval', label: 'Intervalos' },
          ]}
          value={kind}
          onChange={(value) => set('kind', value)}
        />
        <p class="hint">
          {kind === 'absolute' && 'Lee cada nota en la clave elegida.'}
          {kind === 'relative' && 'No hay clave: se da el nombre de la primera nota y el resto se lee por distancia.'}
          {kind === 'interval' && 'Reconoce a simple vista la distancia entre dos notas.'}
        </p>
      </Field>

      {kind === 'absolute' && (
        <>
          <Field label="Clave">
            <Segmented options={MANUAL_CLEF_OPTIONS} value={manual.clef} onChange={(value) => set('clef', value)} />
          </Field>
          {grand ? (
            <p class="hint">
              Dos pentagramas a la vez, como en una partitura de piano. Usa las {grandCount} notas que tengas elegidas en
              clave de Sol y en clave de Fa.
            </p>
          ) : (
            <Field label={`Notas (${selected.length})`}>
              <div class="presets">
                <button type="button" class="chip" onClick={() => setNotes(staffNotes(clef))}>
                  Pentagrama
                </button>
                <button type="button" class="chip" onClick={() => setNotes(range.filter((s) => (s - bottom) % 2 === 0))}>
                  Líneas
                </button>
                <button type="button" class="chip" onClick={() => setNotes(range.filter((s) => (s - bottom) % 2 !== 0))}>
                  Espacios
                </button>
                <button type="button" class="chip" onClick={() => setNotes(range)}>
                  Todas
                </button>
              </div>
              <div class="note-chips">
                {range.map((step) => (
                  <button
                    type="button"
                    class={`chip note-chip${selected.includes(step) ? ' chip-on' : ''}`}
                    style={{ '--chip': `var(--note-${((step % 7) + 7) % 7})` }}
                    aria-pressed={selected.includes(step)}
                    onClick={() => toggleNote(step)}
                  >
                    {noteNameWithOctave(step, notation)}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {!canStart && <p class="hint hint-warn">Elige al menos dos notas.</p>}

          <Field label="Armadura">
            <Segmented
              options={KEY_SIGNATURES.map((value) => ({ value, label: signatureLabel(value) }))}
              value={manual.keySignature}
              onChange={(value) => set('keySignature', value)}
            />
            <p class="hint">
              {manual.keySignature === 0
                ? 'Sin armadura: todas las notas son naturales.'
                : `Tonalidad de ${keyName(manual.keySignature, notation)} mayor: las notas alteradas se tocan en las teclas negras.`}
            </p>
          </Field>
          {manual.keySignature === 0 && (
            <Toggle
              label="Alteraciones sueltas"
              hint="Sostenidos y bemoles junto a algunas notas; se responden con las teclas negras."
              checked={manual.accidentals}
              onChange={(value) => set('accidentals', value)}
            />
          )}
          {!grand && (
            <Toggle
              label="Notas de referencia"
              hint={`Muestra los ${letterName(0, notation)} y ${letterName(4, notation)} como guía (método Dandelot).`}
              checked={manual.reference}
              onChange={(value) => set('reference', value)}
            />
          )}
        </>
      )}

      {kind === 'interval' && (
        <Field label="Intervalo máximo">
          <Segmented
            options={[
              { value: 5, label: 'Hasta 5ª' },
              { value: 7, label: 'Hasta 7ª' },
              { value: 8, label: 'Hasta 8ª' },
            ]}
            value={manual.maxInterval}
            onChange={(value) => set('maxInterval', value)}
          />
        </Field>
      )}

      {kind !== 'interval' && (
        <Field label="Lectura">
          <Segmented<DisplayMode>
            options={[
              { value: 'static', label: 'Grupos fijos' },
              { value: 'moving', label: 'En movimiento', disabled: kind === 'relative' },
              { value: 'hidden', label: 'De memoria' },
              { value: 'pulse', label: 'Con pulso', disabled: kind === 'relative' },
            ]}
            value={display}
            onChange={(value) => set('display', value)}
          />
          <p class="hint">
            {display === 'static' && 'El grupo queda a la vista mientras lo lees.'}
            {display === 'moving' && 'Las notas avanzan hacia la clave y te esperan allí.'}
            {display === 'hidden' && 'Memoriza el grupo y tócalo cuando se oculte.'}
            {display === 'pulse' && 'Metrónomo: cada nota pasa por la franja en su pulso y no se detiene si fallas.'}
          </p>
        </Field>
      )}

      {kind === 'absolute' && display === 'pulse' && (
        <Field label="Tempo (pulsos por minuto)">
          <Segmented
            options={[40, 50, 60, 72, 88, 104].map((value) => ({ value, label: String(value) }))}
            value={manual.bpm}
            onChange={(value) => set('bpm', value)}
          />
        </Field>
      )}

      <Field label="Dificultad">
        <Segmented<Difficulty>
          options={[
            { value: 1, label: 'Fácil' },
            { value: 2, label: 'Media' },
            { value: 3, label: 'Difícil' },
          ]}
          value={manual.difficulty}
          onChange={(value) => set('difficulty', value)}
        />
      </Field>

      <Field label="Aciertos para terminar">
        <Segmented
          options={[
            { value: 10, label: '10' },
            { value: 20, label: '20' },
            { value: 30, label: '30' },
            { value: 50, label: '50' },
            { value: 0, label: 'Sin fin' },
          ]}
          value={manual.goal}
          onChange={(value) => set('goal', value)}
        />
      </Field>

      <Field label="Cronómetro">
        <Segmented
          options={[
            { value: 0, label: 'Sin límite' },
            { value: 30, label: '30 s' },
            { value: 60, label: '1 min' },
            { value: 120, label: '2 min' },
          ]}
          value={manual.timeLimit}
          onChange={(value) => set('timeLimit', value)}
        />
      </Field>

      <Toggle
        label="Supervivencia"
        hint="Tres vidas: cada fallo quita una."
        checked={manual.survival}
        onChange={(value) => set('survival', value)}
      />

      <button type="button" class="primary" disabled={!canStart} onClick={onStart}>
        Empezar
      </button>
    </Page>
  );
}

interface SongsProps {
  progress: Progress;
  clef: ClefId;
  onClef: (clef: ClefId) => void;
  onPlay: (song: Song) => void;
  onAdd: (title: string, text: string) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

function SongRow({ song, clef, stars, onPlay }: { song: Song; clef: ClefId; stars: number; onPlay: (song: Song) => void }) {
  const fits = fitSong(song.phrases, clef) !== null;
  const notes = song.phrases.reduce((sum, phrase) => sum + phrase.length, 0);
  return (
    <button type="button" class="stage tone-songs" disabled={!fits} onClick={() => onPlay(song)}>
      <span class="stage-number">
        <MusicIcon />
      </span>
      <span class="stage-body">
        <span class="stage-title">{song.title}</span>
        <span class="stage-hint">{fits ? `${notes} notas` : 'No cabe en esta clave'}</span>
      </span>
      <Stars count={stars} />
    </button>
  );
}

export function Songs({ progress, clef, onClef, onPlay, onAdd, onDelete, onBack }: SongsProps) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Las canciones propias se guardan como texto; aquí se convierten en notas (las ilegibles se omiten).
  const mine = progress.customSongs.flatMap((custom) => {
    const parsed = parseSong(custom.text);
    return 'error' in parsed ? [] : [{ id: custom.id, title: custom.title, phrases: parsed.phrases }];
  });

  const save = () => {
    if (title.trim() === '') return setError('Ponle un título.');
    const parsed = parseSong(text);
    if ('error' in parsed) return setError(parsed.error);
    onAdd(title.trim(), text.trim());
    setTitle('');
    setText('');
    setError(null);
  };

  return (
    <Page title="Canciones" onBack={onBack}>
      <Field label="Clave">
        <Segmented options={CLEF_OPTIONS} value={clef} onChange={onClef} />
      </Field>
      <p class="hint">Frase a frase y sin ritmo. Suena cada nota que aciertas, así que vas oyendo la melodía.</p>

      <Field label="Mis canciones">
        {mine.length === 0 && <p class="hint">Aún no has añadido ninguna. Se guardan solo en tus dispositivos.</p>}
        <div class="stages">
          {mine.map((song) => (
            <div class="song-row">
              <SongRow song={song} clef={clef} stars={progress.songs[song.id] ?? 0} onPlay={onPlay} />
              {removing === song.id ? (
                <button type="button" class="danger" onClick={() => onDelete(song.id)}>
                  Borrar
                </button>
              ) : (
                <button type="button" class="icon-button" onClick={() => setRemoving(song.id)} aria-label={`Borrar ${song.title}`}>
                  <CloseIcon />
                </button>
              )}
            </div>
          ))}
        </div>
        <details class="song-form">
          <summary>Añadir una canción</summary>
          <label class="text-field">
            <span>Título</span>
            <input type="text" value={title} onInput={(event) => setTitle(event.currentTarget.value)} />
          </label>
          <label class="text-field">
            <span>Notas</span>
            <textarea
              rows={5}
              value={text}
              placeholder={'E5 D#5 E5 D#5 E5\nB4 D5 C5 A4'}
              onInput={(event) => setText(event.currentTarget.value)}
            />
          </label>
          <p class="hint">
            Cada nota es su letra y su octava: C4 es el Do central. Sostenido con # (F#4) y bemol con b (Bb3). Una frase por
            línea, de hasta ocho notas.
          </p>
          {error && <p class="hint hint-warn">{error}</p>}
          <button type="button" class="secondary" onClick={save}>
            Guardar canción
          </button>
        </details>
      </Field>

      <Field label={`Incluidas (${SONGS.length})`}>
        <div class="stages">
          {SONGS.map((song) => (
            <SongRow song={song} clef={clef} stars={progress.songs[song.id] ?? 0} onPlay={onPlay} />
          ))}
        </div>
      </Field>
    </Page>
  );
}

// Dominio de una nota de 0 a 1: la precisión, rebajada si la respuesta es lenta.
const FAST_MS = 1000;
const SLOW_MS = 4000;
const MIN_ANSWERS = 3;

function mastery(stat: NoteStat | undefined): number | null {
  if (!stat || stat.seen < MIN_ANSWERS) return null;
  const accuracy = (stat.seen - stat.wrong) / stat.seen;
  const speed = 1 - Math.max(0, Math.min(1, (stat.ms - FAST_MS) / (SLOW_MS - FAST_MS))) * 0.6;
  return accuracy * speed;
}

/** Del rojo (0) al verde (1), pasando por el amarillo. */
function masteryColor(value: number): string {
  return `hsl(${Math.round(value * 130)} 72% 56%)`;
}

const WEEKS_SHOWN = 8;
// Separación entre notas en el mapa de dominio: la justa para que las cabezas no se toquen.
const MASTERY_SPACING = 15;

interface ProgressProps {
  progress: Progress;
  notation: Notation;
  onBack: () => void;
}

export function ProgressScreen({ progress, notation, onBack }: ProgressProps) {
  const [clef, setClef] = useState<ClefId>('treble');
  const [selected, setSelected] = useState<number | null>(null);
  const now = new Date();
  const steps = clefRange(clef);
  const stats = progress.notes[clef];
  const tints: Record<number, string> = {};
  for (const step of steps) {
    const value = mastery(stats[step]);
    tints[step] = value === null ? 'var(--line)' : masteryColor(value);
  }
  const stat = selected === null ? undefined : stats[selected];
  const weeks = weeklyStats(progress, now, WEEKS_SHOWN);
  const today = progress.days[dateKey(now)];
  const busiest = Math.max(1, ...weeks.map((week) => week.correct + week.wrong));

  return (
    <Page title="Progreso" onBack={onBack}>
      <dl class="stats">
        <div>
          <dt>Hoy</dt>
          <dd>{formatTime(today?.ms ?? 0)}</dd>
        </div>
        <div>
          <dt>Notas hoy</dt>
          <dd>{(today?.correct ?? 0) + (today?.wrong ?? 0)}</dd>
        </div>
        <div>
          <dt>Sesiones</dt>
          <dd>{daysText(streakOf(progress.sessions, now))}</dd>
        </div>
        <div>
          <dt>Retos</dt>
          <dd>{daysText(streakOf(progress.daily, now))}</dd>
        </div>
      </dl>

      <Field label="Dominio de cada nota">
        <Segmented
          options={CLEF_OPTIONS}
          value={clef}
          onChange={(value) => {
            setClef(value);
            setSelected(null);
          }}
        />
        <section class="panel tone-progress">
          <MiniStaff clef={clef} steps={steps} tints={tints} spacing={MASTERY_SPACING} onNoteClick={setSelected} />
          <div class="legend">
            <span class="legend-swatch" style={{ background: masteryColor(0) }} /> por trabajar
            <span class="legend-swatch" style={{ background: masteryColor(0.5) }} /> en camino
            <span class="legend-swatch" style={{ background: masteryColor(1) }} /> dominada
            <span class="legend-swatch" style={{ background: 'var(--line)' }} /> sin datos
          </div>
          <p class="note-detail">
            {selected === null && 'Toca una nota para ver su detalle.'}
            {selected !== null && !stat && `${noteNameWithOctave(selected, notation)}: aún no la has practicado.`}
            {selected !== null && stat && (
              <>
                <strong>{noteNameWithOctave(selected, notation)}</strong>: {Math.round(((stat.seen - stat.wrong) / stat.seen) * 100)} % de
                precisión, {formatSeconds(stat.ms)} de respuesta habitual, {stat.seen} respuestas.{' '}
                {stat.due <= dateKey(now) ? 'Toca repasarla hoy.' : `Próximo repaso: ${stat.due}.`}
              </>
            )}
          </p>
        </section>
      </Field>

      <Field label={`Últimas ${WEEKS_SHOWN} semanas`}>
        <div class="chart chart-weeks" style={{ '--columns': WEEKS_SHOWN }} role="img" aria-label="Evolución por semanas">
          {weeks.map((week, i) => {
            const total = week.correct + week.wrong;
            const accuracy = total > 0 ? Math.round((week.correct / total) * 100) : 0;
            const perMinute = week.ms > 0 ? Math.round(total / (week.ms / 60000)) : 0;
            return (
              <div class={`chart-col${total === 0 ? ' chart-empty' : ''}`}>
                <span class="chart-value">{total > 0 ? `${accuracy} %` : '–'}</span>
                <span class="chart-track">
                  <span
                    class="chart-bar"
                    style={{ height: `${Math.max(4, (total / busiest) * 100)}%`, background: masteryColor(accuracy / 100), '--i': i }}
                  />
                </span>
                <span class="chart-name">{total}</span>
                <span class="chart-value">{total > 0 ? `${perMinute}/min` : ''}</span>
              </div>
            );
          })}
        </div>
        <p class="hint">
          Cada barra es una semana (la de la derecha, la actual): su altura son las notas leídas, su color y la cifra de arriba la
          precisión, y abajo la velocidad en notas por minuto.
        </p>
      </Field>
    </Page>
  );
}

export interface ResultAction {
  label: string;
  onClick: () => void;
}

interface ResultsProps {
  title: string;
  summary: Summary;
  notation: Notation;
  stars: number;
  /** Nombres de las notas falladas; vacío si no aplica. */
  review: string[];
  primary: ResultAction;
  secondary: ResultAction[];
}

const REASON_TITLE: Record<Summary['reason'], string> = {
  goal: '¡Bien tocado!',
  lives: 'Sin vidas',
  time: '¡Tiempo!',
};

export function Results({ title, summary, notation, stars, review, primary, secondary }: ResultsProps) {
  const total = summary.correct + summary.wrong;
  const accuracy = total > 0 ? Math.round((summary.correct / total) * 100) : 0;
  const shownAccuracy = useCountUp(accuracy);
  const hasLetters = summary.letters.some((stat) => stat.seen > 0);
  return (
    <div class="page">
      {stars === 3 && <Confetti />}
      <div class="page-body results">
        <p class="results-context">{title}</p>
        <h1 class="results-title">{REASON_TITLE[summary.reason]}</h1>
        <div class="results-stars">
          <Stars count={stars} />
        </div>
        <dl class="stats">
          <div>
            <dt>Precisión</dt>
            <dd>{shownAccuracy} %</dd>
          </div>
          <div>
            <dt>Tiempo</dt>
            <dd>{formatTime(summary.ms)}</dd>
          </div>
          <div>
            <dt>Aciertos</dt>
            <dd class="stat-ok">{summary.correct}</dd>
          </div>
          <div>
            <dt>Fallos</dt>
            <dd class="stat-bad">{summary.wrong}</dd>
          </div>
        </dl>
        {hasLetters && (
          <div class="chart" role="img" aria-label="Precisión por nota">
            {summary.letters.map((stat, letter) => {
              const rate = stat.seen > 0 ? (stat.seen - stat.wrong) / stat.seen : 0;
              return (
                <div class={`chart-col${stat.seen === 0 ? ' chart-empty' : ''}`}>
                  <span class="chart-value">{stat.seen > 0 ? `${Math.round(rate * 100)}` : '–'}</span>
                  <span class="chart-track">
                    <span
                      class="chart-bar"
                      style={{ height: `${Math.max(4, rate * 100)}%`, background: `var(--note-${letter})`, '--i': letter }}
                    />
                  </span>
                  <span class="chart-name">{letterName(letter, notation)}</span>
                </div>
              );
            })}
          </div>
        )}
        {review.length > 0 && (
          <p class="review">
            <strong>Para repasar:</strong> {review.join(', ')}
          </p>
        )}
        <button type="button" class="primary" onClick={primary.onClick}>
          {primary.label}
        </button>
        <div class="results-actions">
          {secondary.map((action) => (
            <button type="button" class="secondary" onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SettingsProps {
  settings: Settings;
  progress: Progress;
  onChange: (settings: Settings) => void;
  /** Recibe el progreso ya combinado con el de la copia importada. */
  onImport: (progress: Progress) => void;
  onReset: () => void;
  onBack: () => void;
}

export function SettingsScreen({ settings, progress, onChange, onImport, onReset, onBack }: SettingsProps) {
  const [confirming, setConfirming] = useState(false);
  const [backupNote, setBackupNote] = useState<string | null>(null);

  const download = () => {
    const now = new Date();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([exportBackup(progress, now)], { type: 'application/json' }));
    link.download = `lectura-notas-${dateKey(now)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setBackupNote('Copia guardada en tus descargas.');
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    const imported = importBackup(await file.text());
    if (!imported) return setBackupNote('Ese archivo no es una copia de esta app.');
    onImport(mergeProgress(progress, imported));
    setBackupNote('Copia combinada con el progreso de este dispositivo.');
  };
  return (
    <Page title="Ajustes" onBack={onBack}>
      <Field label="Nombres de las notas">
        <Segmented<Notation>
          options={[
            { value: 'english', label: 'C D E … B' },
            { value: 'solfege', label: 'Do Re Mi' },
            { value: 'german', label: 'C D E … H' },
          ]}
          value={settings.notation}
          onChange={(notation) => onChange({ ...settings, notation })}
        />
      </Field>
      <Field label="Responder con">
        <Segmented<InputMode>
          options={[
            { value: 'keys', label: 'Teclado en pantalla' },
            { value: 'mic', label: 'Piano real (micrófono)' },
          ]}
          value={settings.input}
          onChange={(input) => onChange({ ...settings, input })}
        />
        <p class="hint">
          Con micrófono tocas la nota en tu piano y la app la reconoce. Vale en cualquier octava. También se cambia desde el
          propio ejercicio.
        </p>
      </Field>
      <Field label="Tema">
        <Segmented<Theme>
          options={[
            { value: 'dark', label: 'Oscuro' },
            { value: 'light', label: 'Claro' },
          ]}
          value={settings.theme}
          onChange={(theme) => onChange({ ...settings, theme })}
        />
      </Field>
      <Toggle label="Sonido" checked={settings.sound} onChange={(sound) => onChange({ ...settings, sound })} />
      <Toggle
        label="Vibración"
        hint="Un toque al acertar y otro distinto al fallar (solo en teléfonos)."
        checked={settings.haptics}
        onChange={(haptics) => onChange({ ...settings, haptics })}
      />
      <Toggle
        label="Nombres en las teclas"
        hint="Quítalos cuando ya ubiques las notas en el teclado."
        checked={settings.keyLabels}
        onChange={(keyLabels) => onChange({ ...settings, keyLabels })}
      />
      <Field label="Copia de seguridad">
        <p class="hint">
          Para pasar tu progreso entre el ordenador y el teléfono: exporta en uno e importa en el otro. Importar combina,
          no borra: de cada dato se queda con el más avanzado.
        </p>
        <button type="button" class="secondary" onClick={download}>
          Exportar a un archivo
        </button>
        <label class="secondary file-button">
          Importar y combinar
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void restore(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </label>
        {backupNote && <p class="hint">{backupNote}</p>}
      </Field>
      <Field label="Progreso">
        {confirming ? (
          <div class="confirm">
            <p class="hint hint-warn">Se borran capítulos, estadísticas, canciones y retos diarios.</p>
            <button
              type="button"
              class="danger"
              onClick={() => {
                onReset();
                setConfirming(false);
              }}
            >
              Sí, borrar
            </button>
            <button type="button" class="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" class="secondary" onClick={() => setConfirming(true)}>
            Reiniciar progreso
          </button>
        )}
      </Field>
    </Page>
  );
}
