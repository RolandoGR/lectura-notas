// Entrada por micrófono: reconoce la nota que suena en un piano real.
// La altura se estima con el algoritmo YIN, que busca el periodo en el que la señal se repite.

const MIN_FREQUENCY = 60; // algo por debajo de C2
const MAX_FREQUENCY = 1200; // algo por encima de C6
const YIN_THRESHOLD = 0.15;
// Por debajo de este nivel se considera silencio y no se analiza.
const SILENCE_RMS = 0.012;

export function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

/** Frecuencia fundamental en Hz, o null si no hay un tono claro. */
export function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  if (rms(buffer) < SILENCE_RMS) return null;
  const tauMin = Math.floor(sampleRate / MAX_FREQUENCY);
  const tauMax = Math.min(Math.floor(sampleRate / MIN_FREQUENCY), Math.floor(buffer.length / 2));
  const window = buffer.length - tauMax;

  // Diferencia normalizada: cerca de 0 cuando la señal coincide consigo misma desplazada tau muestras.
  const normalized = new Float32Array(tauMax + 1);
  normalized[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let difference = 0;
    for (let i = 0; i < window; i++) {
      const delta = buffer[i] - buffer[i + tau];
      difference += delta * delta;
    }
    running += difference;
    normalized[tau] = running > 0 ? (difference * tau) / running : 1;
  }

  // Primer valle por debajo del umbral: el periodo más corto que explica la señal.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (normalized[t] < YIN_THRESHOLD) {
      while (t + 1 <= tauMax && normalized[t + 1] < normalized[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // Ajuste fino entre muestras con una parábola por los tres puntos del valle.
  const before = normalized[tau - 1] ?? normalized[tau];
  const after = normalized[tau + 1] ?? normalized[tau];
  const curve = before + after - 2 * normalized[tau];
  const shift = curve !== 0 ? (before - after) / (2 * curve) : 0;
  return sampleRate / (tau + shift);
}

export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

// Lecturas seguidas con la misma nota para darla por buena.
const STABLE_READINGS = 3;
// Tras disparar una nota, hay que volver a atacarla (o cambiar de nota) para disparar otra:
// se rearma cuando el volumen cae a esta fracción o sube de golpe.
const RELEASE_RATIO = 0.4;
const ATTACK_RATIO = 1.7;
const BUFFER_SIZE = 2048;

export class MicInput {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private frame = 0;

  /** Pide el micrófono y llama a `onNote` con la nota MIDI cada vez que suena una nueva. */
  async start(onNote: (midi: number) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      // los filtros pensados para voz deforman el sonido de un instrumento
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const context = new AudioContext();
    this.context = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = BUFFER_SIZE;
    context.createMediaStreamSource(this.stream).connect(analyser);

    const buffer = new Float32Array(BUFFER_SIZE);
    let candidate: number | null = null;
    let stable = 0;
    let lastFired: number | null = null;
    let armed = true;
    let firedLevel = 0;
    let smoothed = 0;

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      const level = rms(buffer);
      if (level > smoothed * ATTACK_RATIO && level > SILENCE_RMS) armed = true;
      if (level < firedLevel * RELEASE_RATIO) armed = true;
      smoothed += (level - smoothed) * 0.2;

      const frequency = detectPitch(buffer, context.sampleRate);
      const midi = frequency === null ? null : Math.round(frequencyToMidi(frequency));
      if (midi === null) {
        candidate = null;
        stable = 0;
      } else {
        stable = midi === candidate ? stable + 1 : 1;
        candidate = midi;
        if (stable === STABLE_READINGS && (armed || midi !== lastFired)) {
          lastFired = midi;
          armed = false;
          firedLevel = level;
          onNote(midi);
        }
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.stream = null;
    this.context = null;
  }
}
