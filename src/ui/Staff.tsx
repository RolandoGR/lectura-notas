import type { Ref } from 'preact';
import { CLEFS, keySignaturePositions } from '../music/pitch';
import type { ClefId, Pitch } from '../music/pitch';

/** Ancho mínimo del dibujo; en pantallas apaisadas el ejercicio lo amplía para aprovechar el espacio. */
export const STAFF_WIDTH = 240;
// La franja de lectura y el recorte se salen del dibujo para cubrir toda la altura de la pantalla.
const BLEED = 300;
const SPACE = 10;
const STEM_LENGTH = 34;
const HEAD_HALF_WIDTH = 5.4;
const PAIR_GAP = 18;
const BAND_WIDTH = 24;
// Ancho que ocupa cada alteración de la armadura.
const SIGNATURE_STEP = 8;
const SIGNATURE_X = 52;

// Un pentagrama solo, o los dos del piano: clave de Sol arriba y clave de Fa abajo.
// `bottomLines` es la y de la línea inferior de cada pentagrama.
const SINGLE = { top: 28, height: 160, bottomLines: [115], labelY: 184, countdownY: 170 };
const GRAND = { top: 10, height: 208, bottomLines: [92, 182], labelY: 214, countdownY: 137 };
const GRAND_CLEFS: ClefId[] = ['treble', 'bass'];

// Notas en movimiento: entran casi transparentes y se van haciendo sólidas a lo largo de este tramo;
// al salir por la izquierda se desvanecen en un tramo corto.
const FADE_IN_LENGTH = 90;
const FADE_IN_START = 0.08;
const FADE_OUT_LENGTH = 10;

const GLYPH = {
  notehead: '',
  wholeNote: '',
  sharp: '',
  flat: '',
};

export type NoteState = 'pending' | 'current' | 'correct' | 'wrong' | 'given';

/** Etiqueta que aparece junto a una nota ya respondida, con su nombre y si se acertó. */
export interface Bubble {
  text: string;
  ok: boolean;
  /** Nombre de nota (0 = Do … 6 = Si) que decide el color; -1 para el color neutro. */
  hue: number;
}

export interface StaffNote {
  id: number;
  pitch: Pitch;
  /** Segunda nota de un par (intervalos). */
  second?: Pitch;
  state: NoteState;
  bubble?: Bubble;
  label?: string;
  x: number;
  bottomLine: number;
  /** Pentagrama en el que va la nota cuando hay dos: 0 = arriba, 1 = abajo. */
  row?: number;
  /** Color propio de la nota (mapa de dominio). */
  tint?: string;
}

export interface ReferenceNote {
  step: number;
  label: string;
}

interface Props {
  clef: ClefId | null;
  notes: StaffNote[];
  /** Pentagrama doble de piano; `clef` se ignora. */
  grand?: boolean;
  /** Armadura: sostenidos (positivo) o bemoles (negativo). */
  keySignature?: number;
  reference?: ReferenceNote[];
  /** Límite izquierdo de la zona de notas (notas en movimiento): lo que lo cruza desaparece. */
  clipLeft?: number;
  /** Notas en movimiento: se funden al entrar por la derecha y al salir por la izquierda. */
  stream?: boolean;
  /** La nota pendiente está detenida esperando respuesta: la franja de lectura late. */
  waiting?: boolean;
  /** Franja de lectura fija en esta x (modo con metrónomo) en lugar de seguir a la nota actual. */
  bandX?: number;
  /** Número de pulso: al cambiar, la franja fija da un destello. */
  beat?: number;
  /** Grupo que contiene las notas; quien lo recibe puede desplazarlo sin volver a dibujar. */
  scrollRef?: Ref<SVGGElement>;
  /** Cambia con cada página para que las notas nuevas entren con animación. */
  pageKey?: number;
  /** La página actual está saliendo. */
  leaving?: boolean;
  /** Cuenta atrás que se muestra mientras se memoriza. */
  countdown?: number;
  /** Ancho del dibujo; por defecto el del pentagrama de juego. */
  width?: number;
  /** Versión reducida para tarjetas: sin plicas y recortada en vertical. */
  mini?: boolean;
  /** En la versión reducida, cabezas rellenas (se ve mejor su color). */
  solidHeads?: boolean;
  onNoteClick?: (id: number) => void;
}

/** Altura del dibujo, para que quien lo aloja calcule cuánto ancho cabe. */
export function staffViewHeight(grand: boolean): number {
  return (grand ? GRAND : SINGLE).height;
}

/** x de la primera nota según lo que ocupa el margen izquierdo. */
export function notesStart(hasClef: boolean, hasReference: boolean, keySignature = 0): number {
  // la armadura empuja las notas: su ancho más un pequeño margen tras la clave
  const signature = keySignature === 0 ? 0 : Math.abs(keySignature) * SIGNATURE_STEP + 6;
  if (hasReference) return 100 + signature;
  return (hasClef ? 80 : 40) + signature;
}

function ledgerPositions(pos: number): number[] {
  const out: number[] = [];
  for (let p = -2; p >= pos; p -= 2) out.push(p);
  for (let p = 10; p <= pos; p += 2) out.push(p);
  return out;
}

function centreOf(note: StaffNote): number {
  return note.second ? note.x + PAIR_GAP / 2 : note.x;
}

interface HeadProps {
  pitch: Pitch;
  x: number;
  bottomLine: number;
  stem: boolean;
  /** Sin plica: cabeza rellena en vez de redonda hueca. */
  solid?: boolean;
  yOf: (pos: number) => number;
}

function Head({ pitch, x, bottomLine, stem, solid, yOf }: HeadProps) {
  const pos = pitch.step - bottomLine;
  const y = yOf(pos);
  const stemUp = pos < 4;
  const stemX = stemUp ? x + HEAD_HALF_WIDTH : x - HEAD_HALF_WIDTH;
  return (
    <>
      {ledgerPositions(pos).map((p) => (
        <line class="ledger" x1={x - 10} x2={x + 10} y1={yOf(p)} y2={yOf(p)} />
      ))}
      {pitch.acc !== 0 && (
        <text class="glyph" x={x - 9} y={y} text-anchor="end">
          {pitch.acc === 1 ? GLYPH.sharp : GLYPH.flat}
        </text>
      )}
      <text class="glyph" x={x} y={y} text-anchor="middle">
        {stem || solid ? GLYPH.notehead : GLYPH.wholeNote}
      </text>
      {stem && <line class="stem" x1={stemX} x2={stemX} y1={y} y2={stemUp ? y - STEM_LENGTH : y + STEM_LENGTH} />}
    </>
  );
}

function BubbleMark({ note, yOf }: { note: StaffNote; yOf: (pos: number) => number }) {
  const bubble = note.bubble!;
  const width = Math.max(16, 8 + bubble.text.length * 4.6);
  const y = yOf(note.pitch.step - note.bottomLine);
  // Junto a la cabeza de la nota; en un par, centrada sobre las dos.
  const cx = note.second ? centreOf(note) : note.x - 9;
  const cy = note.second ? Math.min(y, yOf(note.second.step - note.bottomLine)) - 14 : y - 9;
  const badgeX = cx + width / 2 - 1;
  const badgeY = cy - 6;
  const fill = bubble.hue >= 0 ? `var(--note-${bubble.hue})` : 'var(--accent)';
  return (
    <>
      {/* Onda que se abre desde la nota al acertar. */}
      {bubble.ok && <circle class="ripple" cx={centreOf(note)} cy={y} r="7" style={{ stroke: fill }} />}
      <g class="bubble">
        <rect x={cx - width / 2} y={cy - 6.5} width={width} height="13" rx="6.5" style={{ fill }} />
        <text class="bubble-text" x={cx} y={cy + 3} text-anchor="middle">
          {bubble.text}
        </text>
        <circle class={bubble.ok ? 'badge badge-ok' : 'badge badge-bad'} cx={badgeX} cy={badgeY} r="3.6" />
        <path
          class="badge-mark"
          d={
            bubble.ok
              ? `M${badgeX - 1.7} ${badgeY} l1.2 1.3 l2.2 -2.4`
              : `M${badgeX - 1.4} ${badgeY - 1.4} l2.8 2.8 M${badgeX + 1.4} ${badgeY - 1.4} l-2.8 2.8`
          }
        />
      </g>
    </>
  );
}

export function Staff(props: Props) {
  const { clef, notes, reference, clipLeft, stream, waiting, bandX, beat, scrollRef, pageKey, leaving, countdown, mini } = props;
  const grand = props.grand ?? false;
  const signature = props.keySignature ?? 0;
  const width = props.width ?? STAFF_WIDTH;
  const layout = grand ? GRAND : SINGLE;
  const clefs: ClefId[] = grand ? GRAND_CLEFS : clef ? [clef] : [];
  const yIn = (row: number) => (pos: number) => layout.bottomLines[row] - pos * (SPACE / 2);
  const rows = layout.bottomLines.map((_, row) => yIn(row));
  const yOfNote = (note: StaffNote) => rows[note.row ?? 0];

  const current = notes.find((note) => note.state === 'current');
  const middle = notes.length > 0 ? (centreOf(notes[0]) + centreOf(notes[notes.length - 1])) / 2 : width / 2;
  const viewBox = mini ? `0 40 ${width} 112` : `0 ${layout.top} ${width} ${layout.height}`;
  const signatureWidth = signature === 0 ? 0 : Math.abs(signature) * SIGNATURE_STEP + 6;

  // Zona visible de las notas, del límite izquierdo al final de las líneas.
  const left = clipLeft ?? 0;
  const span = width - 6 - left;
  const zone = { x: left, y: -BLEED, width: span, height: BLEED * 2 };
  const notesAttrs = mini ? {} : stream ? { mask: 'url(#notes-fade)' } : { 'clip-path': 'url(#notes-clip)' };
  const band = { x: -BAND_WIDTH / 2, y: -BLEED, width: BAND_WIDTH, height: BLEED * 2 };

  return (
    <svg class={mini ? 'staff staff-mini' : 'staff'} viewBox={viewBox} role="img" aria-label="Pentagrama">
      {!mini && (
        <defs>
          <clipPath id="notes-clip">
            <rect {...zone} />
          </clipPath>
          {stream && (
            <>
              <linearGradient id="notes-fade-ramp" gradientUnits="userSpaceOnUse" x1={left} y1="0" x2={left + span} y2="0">
                <stop offset="0" stop-color="#fff" stop-opacity="0" />
                <stop offset={FADE_OUT_LENGTH / span} stop-color="#fff" stop-opacity="1" />
                <stop offset={1 - FADE_IN_LENGTH / span} stop-color="#fff" stop-opacity="1" />
                <stop offset="1" stop-color="#fff" stop-opacity={FADE_IN_START} />
              </linearGradient>
              <mask id="notes-fade" maskUnits="userSpaceOnUse" {...zone}>
                <rect {...zone} fill="url(#notes-fade-ramp)" />
              </mask>
            </>
          )}
        </defs>
      )}

      {/* Franja fija del modo con metrónomo: las notas pasan por ella al compás. */}
      {bandX !== undefined && (
        <rect key={beat} class="band band-beat" {...band} style={{ transform: `translateX(${bandX}px)` }} />
      )}

      {rows.map((yOf) => [0, 2, 4, 6, 8].map((pos) => <line class="staff-line" x1="6" x2={width - 6} y1={yOf(pos)} y2={yOf(pos)} />))}
      {grand && <line class="staff-line system-line" x1="6" x2="6" y1={rows[0](8)} y2={rows[1](0)} />}

      {clefs.map((id, row) => {
        const def = CLEFS[id];
        const yOf = rows[row];
        return (
          <>
            <text class="glyph clef" x="14" y={yOf(def.glyphPos)}>
              {def.glyph}
            </text>
            {keySignaturePositions(id, signature).map((pos, i) => (
              <text class="glyph clef" x={SIGNATURE_X + i * SIGNATURE_STEP} y={yOf(pos)} text-anchor="middle">
                {signature > 0 ? GLYPH.sharp : GLYPH.flat}
              </text>
            ))}
          </>
        );
      })}

      {clef &&
        !grand &&
        reference?.map((ref) => {
          const pos = ref.step - CLEFS[clef].bottomLine;
          const yOf = rows[0];
          const x = 58 + signatureWidth;
          return (
            <g class="reference">
              {ledgerPositions(pos).map((p) => (
                <line class="ledger" x1={x - 10} x2={x + 10} y1={yOf(p)} y2={yOf(p)} />
              ))}
              <text class="glyph" x={x} y={yOf(pos)} text-anchor="middle">
                {GLYPH.wholeNote}
              </text>
              <text class="reference-label" x={x + 11} y={yOf(pos) + 3}>
                {ref.label}
              </text>
            </g>
          );
        })}

      <g {...notesAttrs}>
        <g ref={scrollRef}>
          <g key={pageKey} class={`notes-page${leaving ? ' notes-leaving' : ''}${stream ? ' notes-stream' : ''}`}>
            {/* Franja de lectura: una sola, que se desliza hasta la nota que toca. */}
            {current && bandX === undefined && (
              <rect
                class={waiting ? 'band band-waiting' : 'band'}
                {...band}
                style={{ transform: `translateX(${centreOf(current)}px)` }}
              />
            )}
            {notes.map((note, i) => {
              const yOf = yOfNote(note);
              const click = props.onNoteClick;
              return (
                <g
                  key={note.id}
                  class={`note note-${note.state}${click ? ' note-button' : ''}`}
                  style={{ '--i': i, color: note.tint }}
                  onClick={click ? () => click(note.id) : undefined}
                >
                  {click && <rect class="note-hit" x={note.x - 7} y="40" width="14" height="112" />}
                  <g class="note-shape">
                    <Head
                      pitch={note.pitch}
                      x={note.x}
                      bottomLine={note.bottomLine}
                      stem={!mini}
                      solid={props.solidHeads}
                      yOf={yOf}
                    />
                    {note.second && (
                      <Head pitch={note.second} x={note.x + PAIR_GAP} bottomLine={note.bottomLine} stem={!mini} yOf={yOf} />
                    )}
                  </g>
                  {note.bubble && <BubbleMark note={note} yOf={yOf} />}
                  {note.label && (
                    <text class="note-label" x={centreOf(note)} y={layout.labelY} text-anchor="middle">
                      {note.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </g>

      {countdown !== undefined && (
        <g key={countdown} class="countdown">
          <circle cx={middle} cy={layout.countdownY} r="10" />
          <text x={middle} y={layout.countdownY + 4.5} text-anchor="middle">
            {countdown}
          </text>
        </g>
      )}
    </svg>
  );
}

interface MiniStaffProps {
  clef: ClefId;
  steps: number[];
  /** Notas que se resaltan (por ejemplo, la que se va a añadir). */
  highlight?: number[];
  /** Color de cada nota, por paso; las que no aparecen usan el color normal. */
  tints?: Record<number, string>;
  /** Separación fija entre notas; sin ella se reparten en un ancho máximo. */
  spacing?: number;
  onNoteClick?: (step: number) => void;
}

/** Pentagrama pequeño que enseña un conjunto de notas, de grave a agudo. */
export function MiniStaff({ clef, steps, highlight = [], tints, spacing: fixed, onNoteClick }: MiniStaffProps) {
  const first = 62;
  const spacing = fixed ?? (steps.length > 1 ? Math.min(20, 190 / (steps.length - 1)) : 0);
  const width = first + spacing * (steps.length - 1) + 22;
  const bottomLine = CLEFS[clef].bottomLine;
  const notes: StaffNote[] = steps.map((step, i) => ({
    id: step,
    pitch: { step, acc: 0 },
    state: highlight.includes(step) ? 'given' : 'pending',
    x: first + i * spacing,
    bottomLine,
    tint: tints?.[step],
  }));
  return <Staff clef={clef} notes={notes} width={width} mini solidHeads={tints !== undefined} onNoteClick={onNoteClick} />;
}
