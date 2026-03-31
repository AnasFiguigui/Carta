import { SoundType } from 'shared';

const hasWindow = globalThis.window !== undefined;
const AudioCtx = hasWindow
  ? (globalThis.window.AudioContext || (globalThis.window as any).webkitAudioContext)
  : null;

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx && AudioCtx) {
    ctx = new AudioCtx();
  }
  return ctx as AudioContext;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  const audioCtx = getCtx();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playNoise(duration: number, volume = 0.05) {
  const audioCtx = getCtx();
  if (!audioCtx) return;

  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

const soundHandlers: Record<SoundType, () => void> = {
  'card-play': () => {
    playNoise(0.08, 0.12);
    playTone(300, 0.1, 'triangle', 0.1);
  },
  'card-draw': () => {
    playNoise(0.06, 0.08);
    playTone(400, 0.08, 'triangle', 0.08);
  },
  'card-stack': () => {
    playTone(200, 0.15, 'sawtooth', 0.1);
    setTimeout(() => playTone(250, 0.15, 'sawtooth', 0.1), 80);
  },
  'timer-tick': () => {
    playTone(800, 0.05, 'square', 0.05);
  },
  'timer-end': () => {
    playTone(200, 0.3, 'sawtooth', 0.15);
    setTimeout(() => playTone(150, 0.4, 'sawtooth', 0.15), 150);
  },
  'turn-start': () => {
    playTone(523, 0.1, 'sine', 0.1);
    setTimeout(() => playTone(659, 0.1, 'sine', 0.1), 100);
  },
  'game-win': () => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, 'sine', 0.12), i * 120);
    });
  },
  'game-lose': () => {
    playTone(300, 0.3, 'sawtooth', 0.1);
    setTimeout(() => playTone(200, 0.4, 'sawtooth', 0.1), 200);
  },
  'player-join': () => {
    playTone(440, 0.1, 'sine', 0.08);
    setTimeout(() => playTone(550, 0.1, 'sine', 0.08), 80);
  },
  'skip': () => {
    playTone(600, 0.1, 'square', 0.08);
    setTimeout(() => playTone(400, 0.15, 'square', 0.08), 100);
  },
  'wild': () => {
    playTone(440, 0.08, 'sine', 0.1);
    setTimeout(() => playTone(550, 0.08, 'sine', 0.1), 70);
    setTimeout(() => playTone(660, 0.08, 'sine', 0.1), 140);
  },
};

let soundEnabled = true;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function playSound(sound: SoundType) {
  if (!soundEnabled) return;
  try {
    // Ensure AudioContext is resumed (requires user interaction)
    const audioCtx = getCtx();
    if (audioCtx?.state === 'suspended') {
      audioCtx.resume();
    }
    soundHandlers[sound]?.();
  } catch {
    // Ignore audio errors
  }
}
