import { describe, expect, it } from 'vitest';
import { Session } from '../src/game/session';
import type { SessionConfig } from '../src/game/session';
import { detectPitch, frequencyToMidi } from '../src/mic';
import {
  CLEFS,
  CLEF_IDS,
  clefRange,
  keyAccidental,
  keyName,
  keySignaturePositions,
  midiOf,
  noteName,
  pitchClassOf,
} from '../src/music/pitch';
import { melodyPhrase, mulberry32, walkPhrase } from '../src/music/phrases';
import { STAGES, initialNotes, nextChoices, starsFor } from '../src/music/program';
import { SONGS, fitSong, parseSong } from '../src/music/songs';
import {
  defaultProgress,
  dueNotes,
  exportBackup,
  importBackup,
  mergeProgress,
  noteWeights,
  recordDay,
  recordNote,
  slowestNotes,
  streakOf,
  weeklyStats,
} from '../src/storage';

const base: SessionConfig = {
  kind: 'absolute',
  clef: 'treble',
  pool: [30, 31, 32, 33, 34, 35, 36, 37, 38],
  accidentals: false,
  display: 'static',
  difficulty: 2,
  goal: 10,
  timeLimit: 0,
  lives: 0,
  reference: false,
  maxInterval: 5,
  seed: 1234,
};

describe('alturas', () => {
  it('sitúa el Do central y el La 440', () => {
    expect(midiOf({ step: 28, acc: 0 })).toBe(60);
    expect(midiOf({ step: 33, acc: 0 })).toBe(69);
    expect(pitchClassOf({ step: 31, acc: 1 })).toBe(6);
  });

  it('cada clave señala su nota en la línea correcta', () => {
    expect(CLEFS.treble.bottomLine + CLEFS.treble.glyphPos).toBe(32); // Sol4
    expect(CLEFS.bass.bottomLine + CLEFS.bass.glyphPos).toBe(24); // Fa3
    expect(CLEFS.alto.bottomLine + CLEFS.alto.glyphPos).toBe(28); // Do4
    expect(CLEFS.tenor.bottomLine + CLEFS.tenor.glyphPos).toBe(28); // Do4
  });

  it('nombra las notas en las tres notaciones', () => {
    expect(noteName({ step: 34, acc: 0 }, 'solfege')).toBe('Si');
    expect(noteName({ step: 34, acc: 0 }, 'german')).toBe('H');
    expect(noteName({ step: 34, acc: -1 }, 'german')).toBe('B');
    expect(noteName({ step: 31, acc: 1 }, 'english')).toBe('F♯');
  });
});

describe('frases', () => {
  it('solo usa notas del conjunto y no repite la nota anterior', () => {
    const pool = [30, 32, 33, 35];
    const phrase = walkPhrase({ pool, length: 50, difficulty: 3, rng: mulberry32(7) });
    expect(phrase).toHaveLength(50);
    phrase.forEach((step, i) => {
      expect(pool).toContain(step);
      if (i > 0) expect(step).not.toBe(phrase[i - 1]);
    });
  });

  it('las melodías solo aparecen si caben enteras', () => {
    const rng = mulberry32(3);
    expect(melodyPhrase([28, 29], rng)).toBeNull();
    const pool = clefRange('treble');
    for (let i = 0; i < 30; i++) {
      for (const step of melodyPhrase(pool, rng) ?? []) expect(pool).toContain(step);
    }
  });
});

describe('modo inteligente', () => {
  it('empieza con tres notas junto a la clave y ofrece la vecina grave y la aguda', () => {
    for (const clef of CLEF_IDS) {
      const notes = initialNotes(clef);
      expect(notes).toHaveLength(3);
      expect(notes).toContain(CLEFS[clef].anchor);
      expect(nextChoices(clef, notes)).toEqual({ lower: notes[0] - 1, upper: notes[2] + 1 });
    }
  });

  it('deja de ofrecer notas al llegar al límite del rango', () => {
    const range = clefRange('treble');
    expect(nextChoices('treble', range)).toEqual({ lower: null, upper: null });
    expect(nextChoices('treble', range.slice(1))).toEqual({ lower: range[0], upper: null });
  });

  it('una ronda son cuatro ejercicios: fijo, en movimiento, de memoria y con pulso', () => {
    expect(STAGES.map((stage) => stage.display)).toEqual(['static', 'moving', 'hidden', 'pulse']);
  });

  it('reparte estrellas por precisión', () => {
    // más de 90 %: tres; de 81 a 90 %: dos; de 70 a 80 %: una
    expect(starsFor(20, 0)).toBe(3);
    expect(starsFor(91, 9)).toBe(3);
    expect(starsFor(90, 10)).toBe(2);
    expect(starsFor(81, 19)).toBe(2);
    expect(starsFor(80, 20)).toBe(1);
    expect(starsFor(70, 30)).toBe(1);
    expect(starsFor(69, 31)).toBe(0);
  });
});

describe('sesión', () => {
  it('termina al alcanzar el objetivo de aciertos', () => {
    const session = new Session(base);
    while (!session.finished) session.answer(session.expected(session.current!));
    expect(session.finished).toBe('goal');
    expect(session.correct).toBe(10);
    expect(session.wrong).toBe(0);
  });

  it('la misma semilla produce el mismo ejercicio', () => {
    const steps = (session: Session) => {
      session.ensure(40);
      return session.items.slice(0, 40).map((item) => item.pitch.step);
    };
    expect(steps(new Session(base))).toEqual(steps(new Session(base)));
    expect(steps(new Session(base))).not.toEqual(steps(new Session({ ...base, seed: 99 })));
  });

  it('en supervivencia cada fallo quita una vida', () => {
    const session = new Session({ ...base, lives: 3 });
    for (let i = 0; i < 3; i++) session.answer((session.expected(session.current!) + 1) % 12);
    expect(session.finished).toBe('lives');
    expect(session.wrong).toBe(3);
    expect(session.mistakes.size).toBeGreaterThan(0);
  });

  it('sin clave da la primera nota de cada frase y nunca la pregunta', () => {
    const session = new Session({ ...base, kind: 'relative', goal: 30 });
    expect(session.items[0].given).toBe(true);
    while (!session.finished) {
      expect(session.current!.given).toBe(false);
      session.answer(session.expected(session.current!));
    }
    const first = session.phraseItems(1);
    expect(first[0].item.given).toBe(true);
    expect(first.filter((entry) => entry.item.given)).toHaveLength(1);
  });

  it('los grupos varían de tamaño y con notas ocultas son cortos', () => {
    const sizes = (config: SessionConfig) => {
      const session = new Session(config);
      session.ensure(300);
      const counts = new Map<number, number>();
      for (const item of session.items) counts.set(item.phrase, (counts.get(item.phrase) ?? 0) + 1);
      // el último grupo generado puede estar a medias: no se cuenta
      return [...counts.values()].slice(0, -1);
    };
    const normal = sizes(base);
    expect(Math.min(...normal)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...normal)).toBeLessThanOrEqual(8);
    expect(new Set(normal).size).toBeGreaterThan(2);
    const hidden = sizes({ ...base, display: 'hidden', difficulty: 1 });
    expect(Math.max(...hidden)).toBeLessThanOrEqual(2);
  });

  it('lleva la cuenta de aciertos y fallos por nombre de nota', () => {
    const session = new Session(base);
    const first = session.current!;
    session.answer((session.expected(first) + 1) % 12);
    const letter = ((first.pitch.step % 7) + 7) % 7;
    expect(session.letters[letter]).toEqual({ seen: 1, wrong: 1 });
  });

  it('los intervalos se quedan dentro del máximo y del pentagrama ampliado', () => {
    const session = new Session({ ...base, kind: 'interval', maxInterval: 5, difficulty: 3 });
    session.ensure(200);
    for (const item of session.items) {
      const size = session.expected(item);
      expect(size).toBeGreaterThanOrEqual(2);
      expect(size).toBeLessThanOrEqual(5);
      const pos = item.second!.step - item.bottomLine;
      expect(pos).toBeGreaterThanOrEqual(-4);
      expect(pos).toBeLessThanOrEqual(12);
    }
  });

  it('las alteraciones evitan las que suenan como tecla blanca', () => {
    const session = new Session({ ...base, accidentals: true, pool: clefRange('treble') });
    session.ensure(400);
    const altered = session.items.filter((item) => item.pitch.acc !== 0);
    expect(altered.length).toBeGreaterThan(0);
    for (const item of altered) expect([1, 3, 6, 8, 10]).toContain(pitchClassOf(item.pitch));
  });
});

describe('armaduras', () => {
  it('altera las letras en el orden de sostenidos y bemoles', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((letter) => keyAccidental(letter, 2))).toEqual([1, 0, 0, 1, 0, 0, 0]); // Fa♯ Do♯
    expect([0, 1, 2, 3, 4, 5, 6].map((letter) => keyAccidental(letter, -2))).toEqual([0, 0, -1, 0, 0, 0, -1]); // Si♭ Mi♭
    expect(keyAccidental(3, 0)).toBe(0);
  });

  it('nombra la tonalidad mayor', () => {
    expect([1, 2, 3, 4, 5].map((n) => keyName(n, 'english'))).toEqual(['G', 'D', 'A', 'E', 'B']);
    expect([-1, -2, -3, -4, -5].map((n) => keyName(n, 'english'))).toEqual(['F', 'B♭', 'E♭', 'A♭', 'D♭']);
    expect(keyName(0, 'english')).toBe('C');
  });

  it('coloca cada alteración sobre la línea o espacio de su nota', () => {
    for (const clef of CLEF_IDS) {
      const letterAt = (pos: number) => (((CLEFS[clef].bottomLine + pos) % 7) + 7) % 7;
      expect(keySignaturePositions(clef, 5).map(letterAt)).toEqual([3, 0, 4, 1, 5]); // Fa Do Sol Re La
      expect(keySignaturePositions(clef, -5).map(letterAt)).toEqual([6, 2, 5, 1, 4]); // Si Mi La Re Sol
    }
  });

  it('en un ejercicio con armadura las notas afectadas se responden alteradas', () => {
    const session = new Session({ ...base, keySignature: 1 });
    session.ensure(80);
    for (const item of session.items) {
      const isF = ((item.pitch.step % 7) + 7) % 7 === 3;
      expect(item.pitch.acc).toBe(isF ? 1 : 0);
      if (isF) expect(session.expected(item)).toBe(6);
    }
  });
});

describe('pentagrama doble, canciones y pulso', () => {
  it('reparte las notas entre clave de Sol y clave de Fa por el Do central', () => {
    const pool = [...clefRange('bass'), ...clefRange('treble')].sort((a, b) => a - b);
    const session = new Session({ ...base, grand: true, pool: [...new Set(pool)] });
    session.ensure(300);
    for (const item of session.items) {
      if (item.pitch.step > 28) expect(item.clef).toBe('treble');
      if (item.pitch.step < 28) expect(item.clef).toBe('bass');
      expect(item.bottomLine).toBe(CLEFS[item.clef!].bottomLine);
    }
    expect(new Set(session.items.map((item) => item.clef))).toEqual(new Set(['treble', 'bass']));
  });

  it('todas las canciones caben en clave de Sol y de Fa, dentro del rango', () => {
    expect(new Set(SONGS.map((song) => song.id)).size).toBe(SONGS.length);
    for (const song of SONGS) {
      for (const clef of ['treble', 'bass'] as const) {
        const phrases = fitSong(song.phrases, clef);
        expect(phrases, `${song.id} en ${clef}`).not.toBeNull();
        const range = clefRange(clef);
        for (const pitch of phrases!.flat()) expect(range).toContain(pitch.step);
        expect(Math.max(...phrases!.map((phrase) => phrase.length))).toBeLessThanOrEqual(8);
      }
    }
  });

  it('lee canciones escritas con letras, octavas y alteraciones', () => {
    const parsed = parseSong('C4 f#4 Bb3\nE5 / D♯5');
    expect(parsed).toEqual({
      phrases: [
        [
          { step: 28, acc: 0 },
          { step: 31, acc: 1 },
          { step: 27, acc: -1 },
        ],
        [{ step: 37, acc: 0 }],
        [{ step: 36, acc: 1 }],
      ],
    });
    // una frase larga se parte en trozos de ocho
    const long = parseSong('C4 D4 E4 F4 G4 A4 B4 C5 D5 E5');
    expect('phrases' in long && long.phrases.map((phrase) => phrase.length)).toEqual([8, 2]);
    expect(parseSong('C4 H4')).toHaveProperty('error');
    expect(parseSong('   ')).toHaveProperty('error');
  });

  it('al colocar una canción conserva sus alteraciones y se responden en las teclas negras', () => {
    const elisa = SONGS.find((song) => song.id === 'para-elisa')!;
    const phrases = fitSong(elisa.phrases, 'treble')!;
    const session = new Session({ ...base, goal: 0, pool: [], song: phrases });
    session.answer(session.expected(session.current!));
    const second = session.current!;
    expect(second.pitch.acc).toBe(1);
    expect(session.expected(second)).toBe(3); // Re sostenido
  });

  it('una canción se toca en su orden y termina con la última nota', () => {
    const phrases = fitSong(SONGS[0].phrases, 'treble')!;
    const session = new Session({ ...base, goal: 0, pool: [], song: phrases });
    const played: number[] = [];
    while (!session.finished) {
      played.push(session.current!.pitch.step);
      session.answer(session.expected(session.current!));
    }
    expect(played).toEqual(phrases.flat().map((pitch) => pitch.step));
    expect(session.finished).toBe('goal');
  });

  it('con pulso, la nota que pasa sin respuesta cuenta como fallo y se sigue', () => {
    const session = new Session({ ...base, display: 'pulse' });
    const first = session.current!;
    expect(session.skip()).toBe(first);
    expect(first.result).toBe('wrong');
    expect(session.wrong).toBe(1);
    expect(session.current).not.toBe(first);
    expect(session.finished).toBeNull();
  });
});

describe('repaso espaciado y progreso', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`);

  it('una nota fluida sube de caja una vez al día y se aleja su repaso', () => {
    const progress = defaultProgress();
    recordNote(progress, 'treble', 32, true, 900, day('2026-03-02'));
    recordNote(progress, 'treble', 32, true, 900, day('2026-03-02'));
    expect(progress.notes.treble[32]).toMatchObject({ seen: 2, wrong: 0, box: 1, due: '2026-03-03' });
    recordNote(progress, 'treble', 32, true, 900, day('2026-03-03'));
    expect(progress.notes.treble[32]).toMatchObject({ box: 2, due: '2026-03-05' });
  });

  it('un fallo devuelve la nota al principio, y una respuesta lenta no la sube', () => {
    const progress = defaultProgress();
    recordNote(progress, 'treble', 32, true, 900, day('2026-03-02'));
    recordNote(progress, 'treble', 32, false, 900, day('2026-03-03'));
    expect(progress.notes.treble[32]).toMatchObject({ wrong: 1, box: 0, due: '2026-03-03' });
    recordNote(progress, 'treble', 33, true, 4000, day('2026-03-02'));
    expect(progress.notes.treble[33].box).toBe(0);
  });

  it('señala las notas que toca repasar y las más lentas', () => {
    const progress = defaultProgress();
    const pool = [31, 32, 33];
    recordNote(progress, 'treble', 31, true, 800, day('2026-03-02'));
    recordNote(progress, 'treble', 32, true, 3200, day('2026-03-02'));
    // 33 nunca se ha practicado: entra en el repaso y encabeza las lentas
    expect(dueNotes(progress, 'treble', pool, day('2026-03-02'))).toEqual([32, 33]);
    expect(dueNotes(progress, 'treble', pool, day('2026-03-03'))).toEqual([31, 32, 33]);
    expect(slowestNotes(progress, 'treble', pool, 2)).toEqual([33, 32]);
  });

  it('da más peso a las notas lentas', () => {
    const progress = defaultProgress();
    for (let i = 0; i < 3; i++) {
      recordNote(progress, 'treble', 31, true, 800, day('2026-03-02'));
      recordNote(progress, 'treble', 32, true, 3600, day('2026-03-02'));
    }
    const weights = noteWeights(progress, 'treble', [31, 32], []);
    expect(weights[32]).toBeGreaterThan(weights[31]);
  });

  it('agrupa lo practicado por semanas de lunes a domingo y cuenta rachas', () => {
    const progress = defaultProgress();
    recordDay(progress, day('2026-03-02'), 20, 5, 60000); // lunes
    recordDay(progress, day('2026-03-08'), 10, 0, 30000); // domingo de la misma semana
    recordDay(progress, day('2026-03-09'), 4, 1, 10000); // lunes siguiente
    const weeks = weeklyStats(progress, day('2026-03-10'), 2);
    expect(weeks).toEqual([
      { start: '2026-03-02', correct: 30, wrong: 5, ms: 90000 },
      { start: '2026-03-09', correct: 4, wrong: 1, ms: 10000 },
    ]);
    expect(streakOf({ '2026-03-08': true, '2026-03-09': true }, day('2026-03-10'))).toBe(2);
    expect(streakOf({ '2026-03-08': true }, day('2026-03-10'))).toBe(0);
  });
});

describe('micrófono', () => {
  // tono con armónicos, parecido a una cuerda de piano
  const tone = (frequency: number, sampleRate = 44100, length = 2048) =>
    Float32Array.from({ length }, (_, i) => {
      const t = (2 * Math.PI * frequency * i) / sampleRate;
      return 0.4 * Math.sin(t) + 0.25 * Math.sin(2 * t) + 0.12 * Math.sin(3 * t);
    });

  it('reconoce la nota de C2 a C6', () => {
    for (let midi = 36; midi <= 84; midi++) {
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const detected = detectPitch(tone(frequency), 44100);
      expect(detected, `nota MIDI ${midi}`).not.toBeNull();
      expect(Math.round(frequencyToMidi(detected!))).toBe(midi);
    }
  });

  it('también a 48 kHz, la frecuencia habitual en teléfonos', () => {
    const detected = detectPitch(tone(261.63, 48000), 48000);
    expect(Math.round(frequencyToMidi(detected!))).toBe(60);
  });

  it('no inventa notas con silencio ni con ruido', () => {
    expect(detectPitch(new Float32Array(2048), 44100)).toBeNull();
    let seed = 7;
    const noise = Float32Array.from({ length: 2048 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed / 2147483648 - 0.5) * 0.6;
    });
    expect(detectPitch(noise, 44100)).toBeNull();
  });
});

describe('copia de seguridad', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`);

  const pc = () => {
    const progress = defaultProgress();
    progress.journey.treble.added.push(31, 35);
    for (let i = 0; i < 5; i++) recordNote(progress, 'treble', 32, true, 900, day('2026-03-02'));
    progress.daily['2026-03-02'] = { ms: 40000, wrong: 2 };
    recordDay(progress, day('2026-03-02'), 30, 2, 60000);
    progress.songs.mary = 2;
    progress.sessions['2026-03-02'] = true;
    progress.customSongs.push({ id: 'mia-1', title: 'Del PC', text: 'C4 D4' });
    return progress;
  };
  const phone = () => {
    const progress = defaultProgress();
    progress.journey.treble.added.push(31);
    progress.journey.bass.added.push(23);
    for (let i = 0; i < 2; i++) recordNote(progress, 'treble', 32, true, 900, day('2026-03-03'));
    recordNote(progress, 'bass', 24, false, 2000, day('2026-03-03'));
    progress.daily['2026-03-02'] = { ms: 35000, wrong: 0 };
    recordDay(progress, day('2026-03-03'), 12, 1, 20000);
    progress.songs.mary = 3;
    progress.sessions['2026-03-03'] = true;
    progress.customSongs.push({ id: 'mia-2', title: 'Del teléfono', text: 'E4' });
    return progress;
  };

  it('combina dos dispositivos quedándose con lo más avanzado de cada dato', () => {
    const merged = mergeProgress(pc(), phone());
    expect(merged.journey.treble.added).toHaveLength(5); // el PC llegó más lejos en clave de Sol
    expect(merged.journey.bass.added).toHaveLength(4); // el teléfono, en clave de Fa
    expect(merged.notes.treble[32].seen).toBe(5);
    expect(merged.notes.bass[24].wrong).toBe(1);
    expect(merged.daily['2026-03-02']).toEqual({ ms: 35000, wrong: 0 });
    expect(Object.keys(merged.days).sort()).toEqual(['2026-03-02', '2026-03-03']);
    expect(merged.songs.mary).toBe(3);
    expect(merged.sessions).toEqual({ '2026-03-02': true, '2026-03-03': true });
    expect(merged.customSongs.map((song) => song.id)).toEqual(['mia-1', 'mia-2']);
  });

  it('da igual el orden y repetir la importación no cambia nada', () => {
    const once = mergeProgress(pc(), phone());
    expect(mergeProgress(once, phone())).toEqual(once);
    const reversed = mergeProgress(phone(), pc());
    expect({ ...reversed, customSongs: [] }).toEqual({ ...once, customSongs: [] });
  });

  it('exporta e importa sin perder nada y rechaza archivos ajenos', () => {
    const original = pc();
    expect(importBackup(exportBackup(original, day('2026-03-04')))).toEqual(original);
    expect(importBackup('{"app":"otra","progress":{}}')).toBeNull();
    expect(importBackup('esto no es JSON')).toBeNull();
  });
});
