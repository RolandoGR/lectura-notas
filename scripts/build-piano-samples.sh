#!/usr/bin/env bash
# Genera public/piano/<midi>.mp3 a partir de las muestras de Salamander Grand Piano
# (paquete @audio-samples/piano-mp3-velocity8): una nota cada tercera menor, de C2 a C6,
# recortada a 2,4 s con desvanecimiento y en mono para que pesen poco.
# Requiere ffmpeg. Uso: bash scripts/build-piano-samples.sh
set -euo pipefail
src="node_modules/@audio-samples/piano-mp3-velocity8/audio"
out="public/piano"
names=("C" "D#" "F#" "A")
offsets=(0 3 6 9)
for octave in 2 3 4 5 6; do
  for i in 0 1 2 3; do
    midi=$((12 * (octave + 1) + offsets[i]))
    [ "$midi" -gt 84 ] && continue
    ffmpeg -v error -y -i "$src/${names[i]}${octave}v8.mp3" -t 2.4 -ac 1 \
      -af "afade=t=out:st=1.5:d=0.9" -b:a 80k "$out/$midi.mp3"
  done
done
