let context: AudioContext | null = null;

// Muestras de piano grabado (Salamander Grand Piano): una cada tercera menor, de C2 a C6.
// El resto de notas se obtiene acelerando o frenando la muestra más cercana.
const SAMPLE_MIDIS = Array.from({ length: 17 }, (_, i) => 36 + i * 3);
const samples = new Map<number, AudioBuffer>();
let samplesRequested = false;

function getContext(): AudioContext {
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** Descarga y decodifica las muestras de piano; mientras llegan suena el tono sintético. */
export function loadPiano(): void {
  if (samplesRequested) return;
  samplesRequested = true;
  try {
    const ctx = getContext();
    for (const midi of SAMPLE_MIDIS) {
      fetch(`${import.meta.env.BASE_URL}piano/${midi}.mp3`)
        .then((response) => response.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => samples.set(midi, buffer))
        .catch(() => {
          // muestra no disponible: esa zona del teclado seguirá con el tono sintético
        });
    }
  } catch {
    // sin audio disponible
  }
}

function nearestSample(midi: number): { buffer: AudioBuffer; base: number } | null {
  let best: number | null = null;
  for (const base of samples.keys()) {
    if (best === null || Math.abs(base - midi) < Math.abs(best - midi)) best = base;
  }
  // más allá de una tercera la muestra desafinada suena artificial: mejor el tono sintético
  if (best === null || Math.abs(best - midi) > 4) return null;
  return { buffer: samples.get(best)!, base: best };
}

function playSynth(ctx: AudioContext, midi: number, at: number, level: number): void {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.32 * level, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
  gain.connect(ctx.destination);

  const partials: [OscillatorType, number, number][] = [
    ['triangle', 1, 1],
    ['sine', 2, 0.35],
    ['sine', 3, 0.12],
  ];
  for (const [type, multiple, partialLevel] of partials) {
    const oscillator = ctx.createOscillator();
    const partialGain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency * multiple;
    partialGain.gain.value = partialLevel;
    oscillator.connect(partialGain).connect(gain);
    oscillator.start(at);
    oscillator.stop(at + 1.15);
  }
}

/** Toca una nota de piano; `delay` en segundos, `level` de 0 a 1. */
export function playMidi(midi: number, delay = 0, level = 1): void {
  try {
    const ctx = getContext();
    loadPiano();
    const at = ctx.currentTime + delay;
    const sample = nearestSample(midi);
    if (!sample) {
      playSynth(ctx, midi, at, level);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = 2 ** ((midi - sample.base) / 12);
    const gain = ctx.createGain();
    gain.gain.value = 0.9 * level;
    source.connect(gain).connect(ctx.destination);
    source.start(at);
  } catch {
    // sin audio disponible: el ejercicio sigue en silencio
  }
}

/** Golpe de metrónomo; el acentuado marca el primer pulso de cada cuatro. */
export function playClick(accent: boolean): void {
  try {
    const ctx = getContext();
    const at = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(accent ? 0.16 : 0.1, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.06);
  } catch {
    // sin audio disponible
  }
}

// Arpegio de Do mayor que acompaña a las estrellas: una nota más por cada estrella.
const FANFARE = [60, 64, 67, 72];

export function playFanfare(stars: number): void {
  FANFARE.slice(0, stars + 1).forEach((midi, i) => playMidi(midi, i * 0.11, 0.8));
}

/** Vibración breve en los dispositivos que la admiten (teléfonos Android); en el resto no hace nada. */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // vibración no permitida: se ignora
  }
}
