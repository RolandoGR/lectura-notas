import { useEffect, useState } from 'preact/hooks';
import { CLEFS, CLEF_IDS, clefRange, noteNameWithOctave } from './music/pitch';
import type { ClefId } from './music/pitch';
import { STAGES, journeyBpm, journeyDifficulty, starsFor } from './music/program';
import { fitSong } from './music/songs';
import type { Song } from './music/songs';
import type { SessionConfig } from './game/session';
import { loadPiano, playFanfare, vibrate } from './audio';
import {
  dailyScore,
  dateKey,
  defaultProgress,
  dueNotes,
  loadProgress,
  loadSettings,
  newJourney,
  noteWeights,
  recordDay,
  recordNote,
  saveProgress,
  saveSettings,
  slowestNotes,
} from './storage';
import type { Settings } from './storage';
import { Exercise } from './ui/Exercise';
import type { Summary } from './ui/Exercise';
import { ChooseNote, Home, Journey, Manual, ProgressScreen, Results, SettingsScreen, Songs } from './ui/screens';
import type { ResultAction } from './ui/screens';

type Source =
  | { type: 'journey'; clef: ClefId; stage: number }
  | { type: 'manual' }
  | { type: 'daily'; date: string }
  | { type: 'song'; id: string; clef: ClefId }
  /** Parte de la sesión guiada; `totals` acumula lo hecho en las partes anteriores. */
  | { type: 'session'; step: number; clef: ClefId; totals: Summary | null };

interface Run {
  id: number;
  config: SessionConfig;
  title: string;
  source: Source;
}

type Screen =
  | { name: 'home' | 'journey' | 'manual' | 'settings' | 'songs' | 'progress' }
  | { name: 'choose'; clef: ClefId }
  | { name: 'play'; run: Run }
  | { name: 'results'; run: Run; summary: Summary; stars: number };

const SURVIVAL_LIVES = 3;
const DAILY_GOAL = 30;
// El modo inteligente nunca baja de las tres notas iniciales.
const MIN_JOURNEY_NOTES = 3;
// Vibración que acompaña a las estrellas de un ejercicio superado.
const CELEBRATION_BUZZ = [15, 70, 15, 70, 40];

// Sesión guiada: cuatro partes cronometradas que suman unos cinco minutos.
const SESSION_PARTS = [
  { title: 'Calentamiento', seconds: 60 },
  { title: 'Nota nueva', seconds: 90 },
  { title: 'Repaso', seconds: 75 },
  { title: 'Con pulso', seconds: 60 },
];
// Cuánto más salen en la sesión las notas lentas (calentamiento) y las que toca repasar.
const SESSION_EMPHASIS = 4;
const WARM_UP_NOTES = 3;

let runCounter = 0;
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

function mergeSummaries(a: Summary | null, b: Summary): Summary {
  if (!a) return b;
  const mistakes = new Map(a.mistakes);
  for (const [step, count] of b.mistakes) mistakes.set(step, (mistakes.get(step) ?? 0) + count);
  return {
    reason: b.reason,
    correct: a.correct + b.correct,
    wrong: a.wrong + b.wrong,
    ms: a.ms + b.ms,
    mistakes: [...mistakes.entries()].sort((x, y) => y[1] - x[1]),
    letters: a.letters.map((stat, i) => ({ seen: stat.seen + b.letters[i].seen, wrong: stat.wrong + b.letters[i].wrong })),
  };
}

export function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [progress, setProgress] = useState(loadProgress);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [journeyClef, setJourneyClef] = useState<ClefId>('treble');
  const [songClef, setSongClef] = useState<ClefId>('treble');

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Las muestras de piano se piden con el primer toque, que es cuando el navegador permite audio.
  useEffect(() => {
    window.addEventListener('pointerdown', loadPiano, { once: true });
    return () => window.removeEventListener('pointerdown', loadPiano);
  }, []);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };
  const commitProgress = () => {
    saveProgress(progress);
    setProgress({ ...progress });
  };
  const goHome = () => setScreen({ name: 'home' });
  const goJourney = () => setScreen({ name: 'journey' });
  const play = (run: Omit<Run, 'id'>) => setScreen({ name: 'play', run: { ...run, id: ++runCounter } });

  /** Ajustes comunes de un ejercicio con clave sobre las notas del modo inteligente. */
  const journeyConfig = (clef: ClefId): SessionConfig => {
    const pool = [...progress.journey[clef].added].sort((a, b) => a - b);
    return {
      kind: 'absolute',
      clef,
      pool,
      accidentals: false,
      display: 'static',
      difficulty: journeyDifficulty(pool.length),
      goal: 0,
      timeLimit: 0,
      lives: 0,
      reference: false,
      maxInterval: 5,
      seed: randomSeed(),
      bpm: journeyBpm(pool.length),
    };
  };
  const newestNotes = (clef: ClefId) => {
    const added = progress.journey[clef].added;
    return added.length > MIN_JOURNEY_NOTES ? [added[added.length - 1]] : [];
  };

  const journeyRun = (clef: ClefId, stageIndex: number): Omit<Run, 'id'> => {
    const stage = STAGES[stageIndex];
    const config = journeyConfig(clef);
    return {
      title: `Clave de ${CLEFS[clef].label} · ${stage.title}`,
      source: { type: 'journey', clef, stage: stageIndex },
      config: {
        ...config,
        display: stage.display,
        goal: stage.goal,
        weights: noteWeights(progress, clef, config.pool, newestNotes(clef)),
      },
    };
  };

  // Cambiar el conjunto de notas empieza una ronda nueva con ese conjunto.
  const setJourneyNotes = (clef: ClefId, added: number[]) => {
    progress.journey[clef] = newJourney(clef, added);
    commitProgress();
  };
  const addJourneyNote = (clef: ClefId, step: number) => setJourneyNotes(clef, [...progress.journey[clef].added, step]);
  const removeLastJourneyNote = (clef: ClefId) => {
    const added = progress.journey[clef].added;
    if (added.length > MIN_JOURNEY_NOTES) setJourneyNotes(clef, added.slice(0, -1));
  };

  const sessionRun = (clef: ClefId, step: number, totals: Summary | null): Omit<Run, 'id'> => {
    const part = SESSION_PARTS[step];
    const config = { ...journeyConfig(clef), timeLimit: part.seconds };
    const emphasize = (steps: number[]) =>
      Object.fromEntries(config.pool.map((s) => [s, steps.includes(s) ? SESSION_EMPHASIS : 1]));
    if (step === 0) {
      config.weights = emphasize(slowestNotes(progress, clef, config.pool, WARM_UP_NOTES));
    } else if (step === 1) {
      config.weights = noteWeights(progress, clef, config.pool, newestNotes(clef));
    } else if (step === 2) {
      config.display = 'moving';
      config.weights = emphasize(dueNotes(progress, clef, config.pool, new Date()));
    } else {
      config.display = 'pulse';
    }
    return {
      title: `Sesión de hoy · ${step + 1} de ${SESSION_PARTS.length}: ${part.title}`,
      source: { type: 'session', step, clef, totals },
      config,
    };
  };

  const manualRun = (): Omit<Run, 'id'> => {
    const manual = settings.manual;
    const absolute = manual.kind === 'absolute';
    const grand = absolute && manual.clef === 'grand';
    const clef: ClefId = manual.clef === 'grand' ? 'treble' : manual.clef;
    const streamOnly = manual.display === 'moving' || manual.display === 'pulse';
    const display = manual.kind === 'interval' || (manual.kind === 'relative' && streamOnly) ? 'static' : manual.display;
    const pool = grand
      ? [...new Set([...manual.notes.bass, ...manual.notes.treble])].sort((a, b) => a - b)
      : manual.notes[clef];
    const titles = {
      absolute: grand ? 'Pentagrama doble' : `Clave de ${CLEFS[clef].label}`,
      relative: 'Sin clave',
      interval: 'Intervalos',
    };
    return {
      title: titles[manual.kind],
      source: { type: 'manual' },
      config: {
        kind: manual.kind,
        clef,
        pool,
        accidentals: manual.accidentals,
        display,
        difficulty: manual.difficulty,
        goal: manual.goal,
        timeLimit: manual.timeLimit,
        lives: manual.survival ? SURVIVAL_LIVES : 0,
        reference: manual.reference,
        maxInterval: manual.maxInterval,
        seed: randomSeed(),
        grand,
        keySignature: absolute ? manual.keySignature : 0,
        bpm: manual.bpm,
      },
    };
  };

  const dailyRun = (): Omit<Run, 'id'> => {
    const now = new Date();
    const date = dateKey(now);
    // La fecha fija la clave y la semilla: el reto es el mismo durante todo el día.
    const clef = CLEF_IDS[(now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate()) % CLEF_IDS.length];
    const bottom = CLEFS[clef].bottomLine;
    return {
      title: `Reto diario · Clave de ${CLEFS[clef].label}`,
      source: { type: 'daily', date },
      config: {
        kind: 'absolute',
        clef,
        pool: clefRange(clef).filter((step) => step - bottom >= -2 && step - bottom <= 10),
        accidentals: false,
        display: 'static',
        difficulty: 2,
        goal: DAILY_GOAL,
        timeLimit: 0,
        lives: 0,
        reference: false,
        maxInterval: 5,
        seed: Number(date.replaceAll('-', '')),
      },
    };
  };

  const songRun = (song: Song, clef: ClefId): Omit<Run, 'id'> | null => {
    const phrases = fitSong(song.phrases, clef);
    if (!phrases) return null;
    return {
      title: song.title,
      source: { type: 'song', id: song.id, clef },
      config: {
        kind: 'absolute',
        clef,
        pool: [...new Set(phrases.flat().map((pitch) => pitch.step))].sort((a, b) => a - b),
        accidentals: false,
        display: 'static',
        difficulty: 1,
        goal: 0,
        timeLimit: 0,
        lives: 0,
        reference: false,
        maxInterval: 5,
        seed: 0,
        song: phrases,
      },
    };
  };

  const rebuild = (run: Run): Omit<Run, 'id'> => {
    const source = run.source;
    if (source.type === 'journey') return journeyRun(source.clef, source.stage);
    if (source.type === 'daily') return dailyRun();
    if (source.type === 'session') return sessionRun(source.clef, source.step, source.totals);
    // la canción ya se pudo colocar una vez en esta clave: repetirla usa la misma configuración
    if (source.type === 'song') return { title: run.title, source, config: run.config };
    return manualRun();
  };

  const handleFinish = (run: Run, summary: Summary) => {
    // quedarse sin vidas no da estrellas; terminar por objetivo o por tiempo, según la precisión
    const stars = summary.reason === 'lives' ? 0 : starsFor(summary.correct, summary.wrong);
    const source = run.source;
    const now = new Date();
    if (source.type === 'journey') {
      const state = progress.journey[source.clef];
      state.stars[source.stage] = Math.max(state.stars[source.stage] ?? 0, stars);
      if (summary.reason === 'goal') state.stage = Math.max(state.stage, source.stage + 1);
    } else if (source.type === 'daily' && summary.reason === 'goal') {
      const previous = progress.daily[source.date];
      if (!previous || dailyScore(summary) < dailyScore(previous)) {
        progress.daily[source.date] = { ms: Math.round(summary.ms), wrong: summary.wrong };
      }
    } else if (source.type === 'song') {
      progress.songs[source.id] = Math.max(progress.songs[source.id] ?? 0, stars);
    } else if (source.type === 'session' && source.step === SESSION_PARTS.length - 1) {
      progress.sessions[dateKey(now)] = true;
    }
    recordDay(progress, now, summary.correct, summary.wrong, summary.ms);
    commitProgress();
    if (stars > 0) {
      if (settings.sound) playFanfare(stars);
      if (settings.haptics) vibrate(CELEBRATION_BUZZ);
    }
    setScreen({ name: 'results', run, summary, stars });
  };

  if (screen.name === 'play') {
    const run = screen.run;
    const exits = { journey: 'journey', manual: 'manual', song: 'songs', daily: 'home', session: 'home' } as const;
    return (
      <Exercise
        key={run.id}
        config={run.config}
        title={run.title}
        settings={settings}
        onNote={(clef, step, ok, ms) => recordNote(progress, clef, step, ok, ms, new Date())}
        onInputChange={(input) => updateSettings({ ...settings, input })}
        onFinish={(summary) => handleFinish(run, summary)}
        onExit={() => {
          saveProgress(progress);
          setScreen({ name: exits[run.source.type] });
        }}
      />
    );
  }

  if (screen.name === 'results') {
    const { run, summary, stars } = screen;
    const source = run.source;
    const retry: ResultAction = { label: 'Repetir', onClick: () => play(rebuild(run)) };
    const home: ResultAction = { label: 'Inicio', onClick: goHome };

    let title = run.title;
    let shown = summary;
    let shownStars = stars;
    let primary = retry;
    let secondary = [home];
    if (source.type === 'journey') {
      const { clef, stage } = source;
      const choose = () => setScreen({ name: 'choose', clef });
      primary =
        stage + 1 < STAGES.length
          ? { label: `Continuar: ${STAGES[stage + 1].title}`, onClick: () => play(journeyRun(clef, stage + 1)) }
          : { label: 'Elegir la siguiente nota', onClick: choose };
      secondary = [{ label: 'Muy fácil', onClick: choose }];
      if (progress.journey[clef].added.length > MIN_JOURNEY_NOTES) {
        secondary.push({
          label: 'Muy difícil',
          onClick: () => {
            removeLastJourneyNote(clef);
            goJourney();
          },
        });
      }
      secondary.push(retry, home);
    } else if (source.type === 'manual') {
      secondary = [{ label: 'Cambiar ajustes', onClick: () => setScreen({ name: 'manual' }) }, home];
    } else if (source.type === 'song') {
      secondary = [{ label: 'Otra canción', onClick: () => setScreen({ name: 'songs' }) }, home];
    } else if (source.type === 'session') {
      const totals = mergeSummaries(source.totals, summary);
      const next = source.step + 1;
      if (next < SESSION_PARTS.length) {
        primary = {
          label: `Continuar: ${SESSION_PARTS[next].title}`,
          onClick: () => play(sessionRun(source.clef, next, totals)),
        };
        secondary = [home];
      } else {
        // última parte: el resumen es el de la sesión entera
        title = 'Sesión de hoy completada';
        shown = totals;
        shownStars = starsFor(totals.correct, totals.wrong);
        primary = home;
        secondary = [{ label: 'Ver mi progreso', onClick: () => setScreen({ name: 'progress' }) }];
      }
    }

    const review =
      run.config.kind === 'absolute' && !run.config.grand
        ? shown.mistakes.slice(0, 5).map(([step, count]) => `${noteNameWithOctave(step, settings.notation)} ×${count}`)
        : [];

    return (
      <Results
        title={title}
        summary={shown}
        notation={settings.notation}
        stars={shownStars}
        review={review}
        primary={primary}
        secondary={secondary}
      />
    );
  }

  if (screen.name === 'journey') {
    return (
      <Journey
        state={progress.journey[journeyClef]}
        notation={settings.notation}
        clef={journeyClef}
        onClef={setJourneyClef}
        onPlay={(stage) => play(journeyRun(journeyClef, stage))}
        onChoose={() => setScreen({ name: 'choose', clef: journeyClef })}
        onAdd={(step) => addJourneyNote(journeyClef, step)}
        onRemoveLast={() => removeLastJourneyNote(journeyClef)}
        onBack={goHome}
      />
    );
  }

  if (screen.name === 'choose') {
    const clef = screen.clef;
    return (
      <ChooseNote
        clef={clef}
        state={progress.journey[clef]}
        notation={settings.notation}
        onConfirm={(step) => {
          setJourneyNotes(clef, step === null ? progress.journey[clef].added : [...progress.journey[clef].added, step]);
          setJourneyClef(clef);
          goJourney();
        }}
        onBack={goJourney}
      />
    );
  }

  if (screen.name === 'manual') {
    return (
      <Manual
        manual={settings.manual}
        notation={settings.notation}
        onChange={(manual) => updateSettings({ ...settings, manual })}
        onStart={() => play(manualRun())}
        onBack={goHome}
      />
    );
  }

  if (screen.name === 'songs') {
    return (
      <Songs
        progress={progress}
        clef={songClef}
        onClef={setSongClef}
        onPlay={(song) => {
          const run = songRun(song, songClef);
          if (run) play(run);
        }}
        onAdd={(title, text) => {
          progress.customSongs.push({ id: `mia-${Date.now()}`, title, text });
          commitProgress();
        }}
        onDelete={(id) => {
          progress.customSongs = progress.customSongs.filter((song) => song.id !== id);
          delete progress.songs[id];
          commitProgress();
        }}
        onBack={goHome}
      />
    );
  }

  if (screen.name === 'progress') {
    return <ProgressScreen progress={progress} notation={settings.notation} onBack={goHome} />;
  }

  if (screen.name === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        progress={progress}
        onChange={updateSettings}
        onImport={(merged) => {
          saveProgress(merged);
          setProgress(merged);
        }}
        onReset={() => {
          const fresh = defaultProgress();
          saveProgress(fresh);
          setProgress(fresh);
        }}
        onBack={goHome}
      />
    );
  }

  return (
    <Home
      progress={progress}
      chapter={progress.journey[journeyClef].added.length - 2}
      onSession={() => play(sessionRun(journeyClef, 0, null))}
      onJourney={goJourney}
      onManual={() => setScreen({ name: 'manual' })}
      onSongs={() => setScreen({ name: 'songs' })}
      onDaily={() => play(dailyRun())}
      onProgress={() => setScreen({ name: 'progress' })}
      onSettings={() => setScreen({ name: 'settings' })}
    />
  );
}
