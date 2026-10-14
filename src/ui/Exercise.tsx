import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Session } from '../game/session';
import type { FinishReason, Item, SessionConfig } from '../game/session';
import { clefRange, intervalNumber, letterName, letterOf, midiOf, noteName } from '../music/pitch';
import type { ClefId } from '../music/pitch';
import type { Difficulty } from '../music/phrases';
import { playClick, playMidi, vibrate } from '../audio';
import { MicInput } from '../mic';
import type { InputMode, Settings } from '../storage';
import { Keyboard } from './Keyboard';
import type { Flash } from './Keyboard';
import { STAFF_WIDTH, Staff, notesStart, staffViewHeight } from './Staff';
import type { NoteState, ReferenceNote, StaffNote } from './Staff';
import { CloseIcon, KeysIcon, MicIcon, ReplayIcon } from './icons';

export interface LetterStat {
  seen: number;
  wrong: number;
}

export interface Summary {
  reason: FinishReason;
  correct: number;
  wrong: number;
  ms: number;
  /** Pasos fallados y cuántas veces, de más a menos. */
  mistakes: [number, number][];
  /** Aciertos y fallos por nombre de nota (Do … Si). */
  letters: LetterStat[];
}

interface Props {
  config: SessionConfig;
  title: string;
  settings: Settings;
  /** Cada respuesta a una nota con clave: dónde estaba, si se acertó y cuánto se tardó. */
  onNote?: (clef: ClefId, step: number, ok: boolean, ms: number) => void;
  onInputChange: (input: InputMode) => void;
  onFinish: (summary: Summary) => void;
  onExit: () => void;
}

const PAGE_TURN_MS = 440;
// Parte final del cambio de página en la que el grupo respondido se desvanece.
const PAGE_FADE_MS = 150;
const FLASH_MS = 400;
const FINISH_DELAY_MS = 800;
// Tope del tiempo de respuesta que se anota: más allá, la pausa no dice nada de la lectura.
const MAX_RESPONSE_MS = 6000;

// Grupos estáticos: separación máxima entre notas; con menos notas el grupo se centra.
const MAX_SPACING = 34;
const MAX_PAIR_SPACING = 64;
const INTERVAL_SLOTS = 4;

// Notas en movimiento: separación entre notas y velocidad, en unidades del pentagrama.
const MOVE_SPACING = 40;
const MOVE_SPEED: Record<Difficulty, number> = { 1: 22, 2: 34, 3: 50 };
// Si la nota pendiente aún está más a la derecha que esta fracción del ancho, el pentagrama
// avanza rápido hasta traerla.
const CATCH_UP_AT = 0.7;
const CATCH_UP_FACTOR = 5;
// Las notas del flujo entran un poco más allá del borde derecho.
const STREAM_LEAD = 12;
// En pantallas apaisadas el pentagrama se ensancha hasta este tope.
const MAX_STAFF_WIDTH = 480;
// Rapidez con la que la velocidad real se acerca a la deseada: evita arrancadas y frenazos bruscos.
const SPEED_EASING = 8;
// La nota pendiente se detiene a esta distancia del inicio de la zona de notas y espera la
// respuesta; el pentagrama empieza a frenar un poco antes para no parar en seco.
const STOP_GAP = 8;
const BRAKE_DISTANCE = 24;
const BRAKE_FLOOR = 0.3;
// Notas que se dibujan por detrás y por delante de la actual: cubren de sobra el ancho visible.
const MOVING_BEHIND = 6;
const MOVING_AHEAD = 12;

// Con metrónomo: cada nota cruza la franja fija justo en su pulso, y las notas van a un pulso de
// distancia. Antes de la primera suenan unos pulsos de entrada.
const PULSE_LINE_GAP = 30;
const PULSE_LEAD_BEATS = 4;
const DEFAULT_BPM = 60;
const BEATS_PER_BAR = 4;

// Notas ocultas: segundos de memorización por nota del grupo, más uno de margen.
const PREVIEW_SECONDS_PER_NOTE: Record<Difficulty, number> = { 1: 1, 2: 0.75, 3: 0.5 };

// Vibración: un toque seco al acertar y dos más largos al fallar.
const HAPTIC_OK = 10;
const HAPTIC_BAD = [30, 50, 30];
// A partir de esta racha de aciertos seguidos se muestra el contador.
const STREAK_SHOWN_FROM = 3;
const STREAK_MILESTONE = 5;

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Nota MIDI con la clase de altura pedida más cercana a `target`. */
function nearestMidi(pc: number, target: number): number {
  for (let distance = 0; distance <= 6; distance++) {
    for (const midi of [target - distance, target + distance]) {
      if (((midi % 12) + 12) % 12 === pc) return midi;
    }
  }
  return target;
}

export function Exercise({ config, title, settings, onNote, onInputChange, onFinish, onExit }: Props) {
  const session = useMemo(() => new Session(config), [config]);
  const [, setTick] = useState(0);
  const [phrase, setPhrase] = useState(() => session.current?.phrase ?? 0);
  const [locked, setLocked] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [streak, setStreak] = useState(0);
  // Notas en movimiento: la nota pendiente llegó a la clave y el pentagrama espera.
  const [waiting, setWaiting] = useState(false);
  const [beat, setBeat] = useState(0);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Notas ocultas: cuenta atrás mientras el grupo está a la vista; null cuando ya se ocultó.
  const [countdown, setCountdown] = useState<number | null>(null);
  const [previewRun, setPreviewRun] = useState(0);
  const [micState, setMicState] = useState<'off' | 'starting' | 'on' | 'error'>('off');

  const isInterval = config.kind === 'interval';
  const isHidden = config.display === 'hidden';
  const isMoving = config.display === 'moving';
  const isPulse = config.display === 'pulse';
  const isStream = isMoving || isPulse;
  const hasClef = config.kind === 'absolute';
  const grand = hasClef && (config.grand ?? false);
  const signature = hasClef ? (config.keySignature ?? 0) : 0;
  const showReference = hasClef && !grand && config.reference;
  const start = notesStart(hasClef, showReference, signature);
  const deadlineX = start - 8;
  const lineX = start + PULSE_LINE_GAP;
  const notation = settings.notation;
  const previewing = isHidden && countdown !== null;
  const useMic = settings.input === 'mic' && !isInterval;
  const songHasAccidentals = config.song?.some((part) => part.some((pitch) => pitch.acc !== 0)) ?? false;

  // El pentagrama se adapta a la forma del hueco disponible: más ancho cuanto más apaisado.
  const [staffWidth, setStaffWidth] = useState(STAFF_WIDTH);
  const widthRef = useRef(STAFF_WIDTH);
  const areaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const { width, height } = area.getBoundingClientRect();
      if (height <= 0) return;
      const fitted = Math.round((staffViewHeight(grand) * width) / height);
      widthRef.current = Math.max(STAFF_WIDTH, Math.min(MAX_STAFF_WIDTH, fitted));
      setStaffWidth(widthRef.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const startedAt = useRef(performance.now());
  // Momento en que la nota actual quedó lista para responder: de ahí sale el tiempo de respuesta.
  const currentSince = useRef(performance.now());
  const done = useRef(false);
  const flashId = useRef(0);
  const timeouts = useRef<number[]>([]);
  const callbacks = useRef({ onNote, onFinish });
  callbacks.current = { onNote, onFinish };

  const later = (fn: () => void, ms: number) => {
    timeouts.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timeouts.current.forEach((id) => clearTimeout(id)), []);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const ms = performance.now() - startedAt.current;
    later(() => {
      callbacks.current.onFinish({
        reason: session.finished ?? 'goal',
        correct: session.correct,
        wrong: session.wrong,
        ms,
        mistakes: [...session.mistakes.entries()].sort((a, b) => b[1] - a[1]),
        letters: session.letters.map((stat) => ({ ...stat })),
      });
    }, FINISH_DELAY_MS);
  };

  const flash = (next: Flash[]) => {
    const id = ++flashId.current;
    setFlashes(next);
    later(() => {
      if (flashId.current === id) setFlashes([]);
    }, FLASH_MS);
  };

  const answerName = (item: Item) =>
    item.second ? `${intervalNumber(item.pitch.step, item.second.step)}ª` : noteName(item.pitch, notation);

  // Reloj y límite de tiempo.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (done.current) return;
      const seconds = (performance.now() - startedAt.current) / 1000;
      setElapsed(seconds);
      if (config.timeLimit > 0 && seconds >= config.timeLimit) {
        session.timeUp();
        finish();
      }
    }, 200);
    return () => clearInterval(id);
  }, [session]);

  // Notas ocultas: cada grupo se enseña con una cuenta atrás y luego desaparece.
  useEffect(() => {
    if (!isHidden) return;
    const count = session.phraseItems(phrase).filter((entry) => !entry.item.given).length;
    let remaining = Math.max(2, Math.ceil(1 + count * PREVIEW_SECONDS_PER_NOTE[config.difficulty]));
    setCountdown(remaining);
    setLocked(true);
    const id = window.setInterval(() => {
      remaining--;
      if (remaining > 0) {
        setCountdown(remaining);
      } else {
        clearInterval(id);
        setCountdown(null);
        setLocked(false);
        currentSince.current = performance.now();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phrase, previewRun, session]);

  // Notas en flujo. El desplazamiento se aplica directamente al grupo de notas, sin redibujar en
  // cada fotograma.
  //  · En movimiento: la nota pendiente nunca se pierde; al acercarse a la clave frena, se detiene
  //    y espera la respuesta.
  //  · Con metrónomo: velocidad constante, una nota por pulso; la que cruza la franja sin
  //    respuesta cuenta como fallo y se sigue adelante.
  const offsetRef = useRef(0);
  const scrollRef = useRef<SVGGElement>(null);
  const streamShift = () =>
    isPulse
      ? lineX + PULSE_LEAD_BEATS * MOVE_SPACING - offsetRef.current
      : widthRef.current + STREAM_LEAD - offsetRef.current;
  const movingX = (index: number) => index * MOVE_SPACING + streamShift();
  useEffect(() => {
    if (!isStream) return;
    let frame = 0;
    let last = performance.now();
    let speed = 0;
    let halted = false;
    let lastBeat = -1;
    const stopX = start + STOP_GAP;
    const pulseSpeed = (MOVE_SPACING * (config.bpm ?? DEFAULT_BPM)) / 60;

    const advancePulse = (dt: number) => {
      offsetRef.current += pulseSpeed * dt;
      const beatNow = Math.floor(offsetRef.current / MOVE_SPACING);
      if (beatNow !== lastBeat) {
        lastBeat = beatNow;
        if (settings.sound) playClick(beatNow % BEATS_PER_BAR === 0);
        setBeat(beatNow);
      }
      // la nota pendiente ya pasó la franja: se da por fallada y la lectura continúa
      if (movingX(session.cursor) < lineX - MOVE_SPACING / 2) {
        const skipped = session.skip();
        if (skipped?.clef) callbacks.current.onNote?.(skipped.clef, skipped.pitch.step, false, MAX_RESPONSE_MS);
        setStreak(0);
        currentSince.current = performance.now();
        if (session.finished) finish();
        setTick((tick) => tick + 1);
      }
    };

    const advanceMoving = (dt: number) => {
      const cruise = MOVE_SPEED[config.difficulty];
      const x = movingX(session.cursor);
      const remaining = Math.max(0, x - stopX);
      const far = x > widthRef.current * CATCH_UP_AT;
      const braking = Math.max(BRAKE_FLOOR, Math.min(1, remaining / BRAKE_DISTANCE));
      const target = remaining === 0 ? 0 : far ? cruise * CATCH_UP_FACTOR : cruise * braking;
      speed += (target - speed) * Math.min(1, dt * SPEED_EASING);
      offsetRef.current += Math.min(speed * dt, remaining);
      if ((remaining === 0) !== halted) {
        halted = remaining === 0;
        setWaiting(halted);
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!session.finished) {
        session.ensure(10);
        if (isPulse) advancePulse(dt);
        else advanceMoving(dt);
      }
      scrollRef.current?.setAttribute('transform', `translate(${streamShift()} 0)`);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [session]);

  const handleAnswer = (value: number) => {
    if (locked || done.current) return;
    const result = session.answer(value);
    if (!result) return;
    const { item, correct, expected } = result;
    const now = performance.now();
    const responseMs = Math.min(MAX_RESPONSE_MS, now - currentSince.current);
    currentSince.current = now;

    // con micrófono ya suena el piano de verdad: la app calla para no confundir al detector
    if (settings.sound && !isInterval && !useMic) {
      const target = midiOf(item.pitch);
      playMidi(correct ? target : nearestMidi(value, target));
    }
    if (item.clef) onNote?.(item.clef, item.pitch.step, correct, responseMs);

    if (correct) {
      flash([{ value, kind: 'ok' }]);
      setFeedback(null);
      setStreak((count) => count + 1);
      if (settings.haptics) vibrate(HAPTIC_OK);
    } else {
      setStreak(0);
      if (settings.haptics) vibrate(HAPTIC_BAD);
      flash([
        { value, kind: 'bad' },
        { value: expected, kind: 'hint' },
      ]);
      setFeedback(`Era ${answerName(item)}`);
    }

    if (session.finished) {
      finish();
    } else if (!isStream) {
      const next = session.current;
      if (next && next.phrase !== phrase) {
        setLocked(true);
        later(() => setLeaving(true), PAGE_TURN_MS - PAGE_FADE_MS);
        later(() => {
          setPhrase(next.phrase);
          setLeaving(false);
          currentSince.current = performance.now();
          // con notas ocultas, el bloqueo lo libera la cuenta atrás del grupo nuevo
          if (!isHidden) setLocked(false);
        }, PAGE_TURN_MS);
      }
    }
    setTick((tick) => tick + 1);
  };

  // Micrófono: cada nota nueva que se oye se trata como si se hubiera tocado esa tecla.
  const answerRef = useRef(handleAnswer);
  answerRef.current = handleAnswer;
  useEffect(() => {
    if (!useMic) {
      setMicState('off');
      return;
    }
    const mic = new MicInput();
    let cancelled = false;
    setMicState('starting');
    mic
      .start((midi) => answerRef.current(((midi % 12) + 12) % 12))
      .then(
        () => !cancelled && setMicState('on'),
        () => !cancelled && setMicState('error'),
      );
    return () => {
      cancelled = true;
      mic.stop();
    };
  }, [useMic]);

  const stateOf = (item: Item, index: number): NoteState => {
    if (item.given) return 'given';
    if (item.result === 'correct') return 'correct';
    if (item.result !== 'pending') return 'wrong';
    // mientras se memoriza el grupo no se marca ninguna nota: aún no toca responder
    return index === session.cursor && !session.finished && !previewing ? 'current' : 'pending';
  };
  const toStaffNote = (item: Item, index: number, x: number): StaffNote => ({
    id: index,
    // con armadura la alteración ya está escrita junto a la clave: no se repite en cada nota
    pitch: signature !== 0 ? { step: item.pitch.step, acc: 0 } : item.pitch,
    second: item.second,
    state: stateOf(item, index),
    bubble:
      item.result === 'pending'
        ? undefined
        : { text: answerName(item), ok: item.result === 'correct', hue: item.second ? -1 : letterOf(item.pitch.step) },
    label: item.given ? answerName(item) : undefined,
    x,
    bottomLine: item.bottomLine,
    row: grand && item.clef === 'bass' ? 1 : 0,
  });

  let notes: StaffNote[];
  if (isStream) {
    // Ventana de notas alrededor de la actual, en coordenadas del flujo: el grupo entero es el que se mueve.
    session.ensure(MOVING_AHEAD);
    notes = [];
    const last = Math.min(session.items.length, session.cursor + MOVING_AHEAD);
    for (let index = Math.max(0, session.cursor - MOVING_BEHIND); index < last; index++) {
      notes.push(toStaffNote(session.items[index], index, index * MOVE_SPACING));
    }
  } else {
    const entries = session.phraseItems(phrase);
    const available = staffWidth - (isInterval ? 46 : 16) - start;
    const gaps = isInterval ? INTERVAL_SLOTS - 1 : entries.length - 1;
    const spacing = gaps > 0 ? Math.min(isInterval ? MAX_PAIR_SPACING : MAX_SPACING, available / gaps) : 0;
    const first = start + (available - spacing * (entries.length - 1)) / 2;
    notes = entries
      // con el grupo oculto solo se ven las notas dadas y las ya respondidas
      .filter(({ item }) => !isHidden || previewing || item.given || item.result !== 'pending')
      .map(({ item, index }) => toStaffNote(item, index, first + (index - entries[0].index) * spacing));
  }

  const reference: ReferenceNote[] | undefined = showReference
    ? clefRange(config.clef)
        .filter((step) => letterOf(step) === 0 || letterOf(step) === 4)
        .map((step) => ({ step, label: letterName(letterOf(step), notation) }))
    : undefined;

  const clock = config.timeLimit > 0 ? config.timeLimit - elapsed : elapsed;
  const intervalValues = Array.from({ length: config.maxInterval - 1 }, (_, i) => i + 2);
  const countingIn = isPulse && beat < PULSE_LEAD_BEATS && session.cursor === 0;

  let prompt = feedback;
  if (previewing) prompt = 'Memoriza el grupo…';
  else if (countingIn) prompt = `Entrada: ${Math.min(PULSE_LEAD_BEATS, beat + 1)} de ${PULSE_LEAD_BEATS}`;
  else if (micState === 'error') prompt = 'No se pudo abrir el micrófono';
  else if (!feedback && micState === 'starting') prompt = 'Abriendo el micrófono…';
  else if (!feedback && micState === 'on') prompt = 'Toca la nota en tu piano';
  else if (!feedback && isHidden) prompt = 'Tócalo de memoria';

  return (
    <div class="play">
      <header class="hud">
        <button type="button" class="icon-button" onClick={onExit} aria-label="Salir">
          <CloseIcon />
        </button>
        <div class="hud-title">{title}</div>
        <div class="progress">
          {config.goal > 0 && (
            <div class="progress-fill" style={{ transform: `scaleX(${Math.min(1, session.correct / config.goal)})` }} />
          )}
          <span class="progress-text" key={session.correct}>
            {session.correct}
            {config.goal > 0 ? ` / ${config.goal}` : ' aciertos'}
          </span>
        </div>
        <div class="hud-stats">
          {config.lives > 0 && (
            <span class="lives" aria-label={`${session.lives} vidas`}>
              {'♥'.repeat(Math.max(0, session.lives))}
              <span class="lives-lost">{'♥'.repeat(config.lives - Math.max(0, session.lives))}</span>
            </span>
          )}
          {streak >= STREAK_SHOWN_FROM && (
            <span key={streak} class={`streak${streak % STREAK_MILESTONE === 0 ? ' streak-big' : ''}`}>
              Racha {streak}
            </span>
          )}
          {session.wrong > 0 && <span class="misses">✕ {session.wrong}</span>}
          <span class={`clock${config.timeLimit > 0 && clock < 10 ? ' clock-low' : ''}`}>{formatClock(clock)}</span>
        </div>
      </header>

      <div class="staff-area" ref={areaRef}>
        <Staff
          width={staffWidth}
          clef={hasClef ? config.clef : null}
          grand={grand}
          keySignature={signature}
          notes={notes}
          reference={reference}
          clipLeft={isStream ? deadlineX : undefined}
          stream={isStream}
          waiting={waiting}
          bandX={isPulse ? lineX : undefined}
          beat={beat}
          scrollRef={scrollRef}
          pageKey={isStream ? 0 : phrase}
          leaving={leaving}
          countdown={countdown ?? undefined}
        />
        <div class="staff-tools">
          {isHidden && !previewing && !done.current && (
            <button
              type="button"
              class="icon-button tool-replay"
              onClick={() => setPreviewRun((run) => run + 1)}
              aria-label="Ver el grupo otra vez"
            >
              <ReplayIcon />
            </button>
          )}
          {!isInterval && (
            <button
              type="button"
              class={`icon-button tool-input${useMic ? ' tool-on' : ''}`}
              onClick={() => onInputChange(useMic ? 'keys' : 'mic')}
              aria-label={useMic ? 'Responder con el teclado en pantalla' : 'Responder con un piano real por el micrófono'}
              aria-pressed={useMic}
            >
              {useMic ? <MicIcon /> : <KeysIcon />}
            </button>
          )}
        </div>
        <div class="feedback" aria-live="polite">
          <span key={prompt ?? ''}>{prompt}</span>
        </div>
      </div>

      {isInterval ? (
        <div class={`interval-keys${locked ? ' keyboard-locked' : ''}`}>
          {intervalValues.map((value) => {
            const active = flashes.find((f) => f.value === value);
            return (
              <button
                type="button"
                class={`interval-key${active ? ` key-${active.kind}` : ''}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  handleAnswer(value);
                }}
              >
                {value}ª
              </button>
            );
          })}
        </div>
      ) : (
        <Keyboard
          onPress={handleAnswer}
          labels={settings.keyLabels ? [0, 1, 2, 3, 4, 5, 6].map((letter) => letterName(letter, notation)) : null}
          flashes={flashes}
          blackEnabled={hasClef && (config.accidentals || signature !== 0 || songHasAccidentals)}
          locked={locked}
        />
      )}
    </div>
  );
}
