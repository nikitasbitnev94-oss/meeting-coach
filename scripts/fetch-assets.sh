#!/usr/bin/env bash
# Скачивает модели MediaPipe и Vosk в public/models и копирует wasm MediaPipe в public/mediapipe-wasm.
# Повторный запуск пропускает уже скачанные файлы.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODELS="$ROOT/public/models"
WASM="$ROOT/public/mediapipe-wasm"
mkdir -p "$MODELS" "$WASM"

fetch() { # url dest
  if [ -s "$2" ]; then echo "есть: $(basename "$2")"; return; fi
  echo "качаю: $1"
  curl -fsSL --retry 3 -o "$2.part" "$1"
  mv "$2.part" "$2"
}

fetch https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task \
  "$MODELS/face_landmarker.task"
fetch https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task \
  "$MODELS/hand_landmarker.task"

if [ ! -s "$MODELS/vosk-ru.tar.gz" ]; then
  TMP="$(mktemp -d)"
  fetch https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip "$TMP/model.zip"
  (cd "$TMP" && unzip -q model.zip && tar -czf "$MODELS/vosk-ru.tar.gz" vosk-model-small-ru-0.22)
  rm -rf "$TMP"
else
  echo "есть: vosk-ru.tar.gz"
fi

cp "$ROOT"/node_modules/@mediapipe/tasks-vision/wasm/* "$WASM/"
echo "готово"
