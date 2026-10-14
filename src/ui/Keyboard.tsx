import { WHITE_PCS } from '../music/pitch';

export type FlashKind = 'ok' | 'bad' | 'hint';

export interface Flash {
  value: number;
  kind: FlashKind;
}

interface Props {
  onPress: (pc: number) => void;
  /** Etiqueta de cada tecla blanca, de Do a Si; null para no mostrar nombres. */
  labels: string[] | null;
  flashes: Flash[];
  /** Las teclas negras solo responden cuando el ejercicio incluye alteraciones. */
  blackEnabled: boolean;
  /** Teclado en pausa (cambio de grupo o memorización): se ve apagado y no responde. */
  locked: boolean;
}

// Tecla negra: clase de altura y tecla blanca (0-6) a cuya derecha se sitúa.
const BLACK_KEYS: [number, number][] = [
  [1, 0],
  [3, 1],
  [6, 3],
  [8, 4],
  [10, 5],
];

const WHITE_WIDTH = 100 / 7;
const BLACK_WIDTH = WHITE_WIDTH * 0.62;

export function Keyboard({ onPress, labels, flashes, blackEnabled, locked }: Props) {
  const flashClass = (pc: number) => {
    const flash = flashes.find((f) => f.value === pc);
    return flash ? ` key-${flash.kind}` : '';
  };
  const press = (pc: number) => (event: PointerEvent) => {
    event.preventDefault();
    onPress(pc);
  };

  return (
    <div class={`keyboard${locked ? ' keyboard-locked' : ''}`}>
      {WHITE_PCS.map((pc, i) => (
        <button type="button" class={`key key-white${flashClass(pc)}`} onPointerDown={press(pc)}>
          {labels && (
            <span class="key-label">
              <span class="key-dot" style={{ background: `var(--note-${i})` }} />
              {labels[i]}
            </span>
          )}
        </button>
      ))}
      {BLACK_KEYS.map(([pc, after]) => (
        <button
          type="button"
          class={`key key-black${flashClass(pc)}${blackEnabled ? '' : ' key-inert'}`}
          style={{ left: `${(after + 1) * WHITE_WIDTH - BLACK_WIDTH / 2}%`, width: `${BLACK_WIDTH}%` }}
          disabled={!blackEnabled}
          aria-label="Tecla negra"
          onPointerDown={press(pc)}
        />
      ))}
    </div>
  );
}
