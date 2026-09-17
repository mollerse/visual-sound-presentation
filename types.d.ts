import type { MidiControl } from "@mollerse/midi-control";

type StartFn = (
  canvas: HTMLCanvasElement,
  controls: MidiControl,
  audioContext: AudioContext,
  canvasSlide: HTMLElement,
) => void | Promise<void>;

type StopFn = () => void;

type CanvasDemo = {
  start: StartFn;
  stop: StopFn;
};

type AvailableDemo = "sinusoids" | "fft" | "music-fft" | "spectrogram" | "beat";

export { CanvasDemo, AvailableDemo, StartFn, StopFn };
