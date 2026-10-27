import type { GreetingConfig } from '../types/greeting-config.type';
import type { VadSegment } from '../types/vad-segment.type';

export const analyzeVad = (
  samples: Int16Array,
  rate: number,
  config: GreetingConfig['vad'],
  fps: number,
): { segments: VadSegment[]; peaks: number[] } => {
  const window = Math.max(1, Math.round((rate * config.windowMs) / 1000));
  const states: { start: number; end: number; speaking: boolean }[] = [];
  const peaks: number[] = [];
  let speaking = false;

  for (let offset = 0; offset < samples.length; offset += window) {
    let sum = 0;
    let peak = 0;
    const end = Math.min(samples.length, offset + window);

    for (let index = offset; index < end; index += 1) {
      const value = samples[index] / 32768;

      sum += value * value;
      peak = Math.max(peak, Math.abs(value));
    }

    const db = 20 * Math.log10(Math.max(1e-8, Math.sqrt(sum / (end - offset))));

    speaking = speaking
      ? db >= config.thresholdDb - config.hysteresisDb
      : db >= config.thresholdDb;

    peaks.push(peak);

    const previous = states[states.length - 1];

    if (previous?.speaking === speaking) {
      previous.end = end / rate;
    } else {
      states.push({ start: offset / rate, end: end / rate, speaking });
    }
  }

  for (const state of states) {
    if (
      state.speaking &&
      (state.end - state.start) * 1000 < config.minSpeechMs
    ) {
      state.speaking = false;
    }
  }

  for (let index = 1; index < states.length - 1; index += 1) {
    const state = states[index];

    if (
      !state.speaking &&
      states[index - 1].speaking &&
      states[index + 1].speaking &&
      (state.end - state.start) * 1000 < config.minSilenceMs
    ) {
      state.speaking = true;
    }
  }

  const segments: VadSegment[] = [];

  for (const state of states) {
    const start = Math.round(state.start * fps) / fps;
    const end = Math.round(state.end * fps) / fps;

    if (end <= start) {
      continue;
    }

    const previous = segments[segments.length - 1];

    if (previous?.speaking === state.speaking) {
      previous.end = end;
    } else {
      segments.push({ start, end, speaking: state.speaking });
    }
  }

  return { segments, peaks };
};
