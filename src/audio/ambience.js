/*
 * Procedural ambience.
 *
 * The configurator does not ship audio files. Everything here is synthesised
 * from noise buffers and oscillators: a rain bed with droplets, a city traffic
 * rumble with occasional horns and a distant crowd, a village wind bed with
 * birds and conversation, and an Alpine pass with wind, bells and a sparse
 * alphorn melody. Spoken mission lines use the browser's speech synthesiser so
 * they sound like a person rather than a synth patch. The graph is created
 * lazily on the first user gesture so browsers never block autoplay.
 */

const MASTER_LEVEL = 0.62;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function noiseBuffer(ctx, seconds, colour = "white") {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (colour === "brown") {
      brown = (brown + 0.018 * white) / 1.018;
      data[i] = brown * 3.4;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

function ramp(param, value, ctx, seconds = 0.55) {
  if (!ctx) return;
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, Math.max(0.02, seconds / 3));
}

export function createAmbience() {
  let ctx = null;
  let master = null;
  let cityBus = null;
  let villageBus = null;
  let alpsBus = null;
  let tokyoBus = null;
  let rainBus = null;
  let cityHum = null;
  let cityNoiseGain = null;
  let windGain = null;
  let alpsWindGain = null;
  let built = false;
  let muted = false;
  let stage = null;
  let rainOn = false;
  let nextHorn = 0;
  let nextBird = 0;
  let nextDrop = 0;
  let nextAlpsNote = 0;
  let nextAlpsBell = 0;
  let nextTokyoTrain = 0;
  let nextTokyoBell = 0;
  let speechVoice = null;
  let noiseHit = null;

  function connectNoise(parent, buffer, filterType, frequency, q, gainValue) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter).connect(gain).connect(parent);
    source.start();
    return { source, filter, gain };
  }

  /**
   * A distant conversation voice. A sawtooth glottal source is shaped by two
   * formant filters and gated by a syllable-rate square LFO, which reads as
   * muffled speech instead of a synth tone. Several of these at different
   * pitches and pans make a crowd murmur without any samples.
   */
  function makeCrowdVoice(parent, { pitch = 165, level = 0.01, pan = 0, rate = 3.4 }) {
    const out = ctx.createGain();
    out.gain.value = level;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner).connect(parent);

    const source = ctx.createOscillator();
    source.type = "sawtooth";
    source.frequency.value = pitch;

    const cadence = ctx.createOscillator();
    cadence.frequency.value = 0.1 + Math.random() * 0.12;
    const cadenceDepth = ctx.createGain();
    cadenceDepth.gain.value = pitch * 0.15;
    cadence.connect(cadenceDepth).connect(source.frequency);
    cadence.start();

    const syllable = ctx.createOscillator();
    syllable.type = "square";
    syllable.frequency.value = rate;
    const syllableDepth = ctx.createGain();
    syllableDepth.gain.value = 0.4;
    const gate = ctx.createGain();
    gate.gain.value = 0.42;
    syllable.connect(syllableDepth).connect(gate.gain);
    syllable.start();

    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 470 + Math.random() * 160;
    f1.Q.value = 5.5;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1350 + Math.random() * 420;
    f2.Q.value = 8;
    const f2Gain = ctx.createGain();
    f2Gain.gain.value = 0.55;

    const sum = ctx.createGain();
    sum.gain.value = 0.62;
    source.connect(f1).connect(sum);
    source.connect(f2).connect(f2Gain).connect(sum);
    sum.connect(gate).connect(out);
    source.start();
  }

  function build() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    try {
      ctx = new AudioCtor();
    } catch {
      return false;
    }

    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_LEVEL;
    master.connect(ctx.destination);
    noiseHit = noiseBuffer(ctx, 1.2, "white");

    /* ------------------------------- city ------------------------------- */
    cityBus = ctx.createGain();
    cityBus.gain.value = 0;
    cityBus.connect(master);

    const brown = noiseBuffer(ctx, 3.2, "brown");
    const white = noiseBuffer(ctx, 2.4, "white");

    const rumble = connectNoise(cityBus, brown, "lowpass", 185, 0.7, 0.24);
    cityNoiseGain = rumble.gain;
    const rumbleLfo = ctx.createOscillator();
    rumbleLfo.frequency.value = 0.075;
    const rumbleDepth = ctx.createGain();
    rumbleDepth.gain.value = 0.07;
    rumbleLfo.connect(rumbleDepth).connect(rumble.gain);
    rumbleLfo.start();

    connectNoise(cityBus, white, "bandpass", 720, 0.55, 0.034);

    cityHum = ctx.createOscillator();
    cityHum.type = "sawtooth";
    cityHum.frequency.value = 48;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 150;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.028;
    cityHum.connect(humFilter).connect(humGain).connect(cityBus);
    cityHum.start();

    const cityPadGain = ctx.createGain();
    cityPadGain.gain.value = 0.011;
    cityPadGain.connect(cityBus);
    for (const frequency of [110, 164.81, 220]) {
      const pad = ctx.createOscillator();
      pad.type = "sine";
      pad.frequency.value = frequency;
      pad.connect(cityPadGain);
      pad.start();
    }

    // Sidewalk conversation drifting over the traffic.
    makeCrowdVoice(cityBus, { pitch: 142, level: 0.011, pan: -0.62, rate: 3.1 });
    makeCrowdVoice(cityBus, { pitch: 178, level: 0.009, pan: 0.28, rate: 4.05 });
    makeCrowdVoice(cityBus, { pitch: 208, level: 0.006, pan: 0.74, rate: 2.7 });

    /* ------------------------------ village ----------------------------- */
    villageBus = ctx.createGain();
    villageBus.gain.value = 0;
    villageBus.connect(master);

    const wind = connectNoise(villageBus, brown, "bandpass", 430, 0.45, 0.2);
    windGain = wind.gain;
    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.085;
    const windDepth = ctx.createGain();
    windDepth.gain.value = 0.09;
    windLfo.connect(windDepth).connect(wind.gain);
    windLfo.start();

    connectNoise(villageBus, white, "bandpass", 1900, 0.85, 0.018);

    const villagePadGain = ctx.createGain();
    villagePadGain.gain.value = 0.009;
    villagePadGain.connect(villageBus);
    for (const frequency of [196, 293.66]) {
      const pad = ctx.createOscillator();
      pad.type = "sine";
      pad.frequency.value = frequency;
      pad.connect(villagePadGain);
      pad.start();
    }

    // A couple of villagers talking by the green, further back than the city.
    makeCrowdVoice(villageBus, { pitch: 152, level: 0.006, pan: -0.45, rate: 2.85 });
    makeCrowdVoice(villageBus, { pitch: 194, level: 0.005, pan: 0.58, rate: 3.6 });

    /* ------------------------------- alps ------------------------------- */
    alpsBus = ctx.createGain();
    alpsBus.gain.value = 0;
    alpsBus.connect(master);

    const alpsWind = connectNoise(alpsBus, brown, "bandpass", 360, 0.5, 0.17);
    alpsWindGain = alpsWind.gain;
    const alpsLfo = ctx.createOscillator();
    alpsLfo.frequency.value = 0.06;
    const alpsDepth = ctx.createGain();
    alpsDepth.gain.value = 0.08;
    alpsLfo.connect(alpsDepth).connect(alpsWind.gain);
    alpsLfo.start();

    // Thin, cold air hissing over the snow.
    connectNoise(alpsBus, white, "highpass", 2800, 0.5, 0.012);

    // A long delay gives the alphorn its valley echo.
    const alpsDelay = ctx.createDelay(1.2);
    alpsDelay.delayTime.value = 0.46;
    const alpsFeedback = ctx.createGain();
    alpsFeedback.gain.value = 0.26;
    const alpsWet = ctx.createGain();
    alpsWet.gain.value = 0.32;
    alpsBus.connect(alpsDelay);
    alpsDelay.connect(alpsFeedback).connect(alpsDelay);
    alpsDelay.connect(alpsWet).connect(master);

    // Low drone under the music.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.012;
    droneGain.connect(alpsBus);
    for (const frequency of [73.42, 110]) {
      const drone = ctx.createOscillator();
      drone.type = "sine";
      drone.frequency.value = frequency;
      drone.connect(droneGain);
      drone.start();
    }

    /* ------------------------------- tokyo ------------------------------- */
    tokyoBus = ctx.createGain();
    tokyoBus.gain.value = 0;
    tokyoBus.connect(master);

    // A deeper, more electrical bed than Night City: traffic rumble, the thin
    // hiss of wet asphalt and the 100 Hz hum of a thousand transformers.
    const tokyoRumble = connectNoise(tokyoBus, brown, "lowpass", 165, 0.7, 0.2);
    const tokyoRumbleLfo = ctx.createOscillator();
    tokyoRumbleLfo.frequency.value = 0.062;
    const tokyoRumbleDepth = ctx.createGain();
    tokyoRumbleDepth.gain.value = 0.055;
    tokyoRumbleLfo.connect(tokyoRumbleDepth).connect(tokyoRumble.gain);
    tokyoRumbleLfo.start();

    connectNoise(tokyoBus, white, "bandpass", 860, 0.6, 0.028);
    connectNoise(tokyoBus, white, "highpass", 3200, 0.5, 0.014);

    const tokyoHum = ctx.createOscillator();
    tokyoHum.type = "sawtooth";
    tokyoHum.frequency.value = 100;
    const tokyoHumFilter = ctx.createBiquadFilter();
    tokyoHumFilter.type = "lowpass";
    tokyoHumFilter.frequency.value = 220;
    const tokyoHumGain = ctx.createGain();
    tokyoHumGain.gain.value = 0.012;
    tokyoHum.connect(tokyoHumFilter).connect(tokyoHumGain).connect(tokyoBus);
    tokyoHum.start();

    const tokyoPadGain = ctx.createGain();
    tokyoPadGain.gain.value = 0.008;
    tokyoPadGain.connect(tokyoBus);
    for (const frequency of [98, 146.83, 196]) {
      const pad = ctx.createOscillator();
      pad.type = "triangle";
      pad.frequency.value = frequency;
      pad.connect(tokyoPadGain);
      pad.start();
    }

    // Foot traffic and late-night conversation under the signage.
    makeCrowdVoice(tokyoBus, { pitch: 148, level: 0.01, pan: -0.55, rate: 3.3 });
    makeCrowdVoice(tokyoBus, { pitch: 186, level: 0.008, pan: 0.2, rate: 4.2 });
    makeCrowdVoice(tokyoBus, { pitch: 222, level: 0.005, pan: 0.72, rate: 2.8 });

    /* -------------------------------- rain ------------------------------ */
    rainBus = ctx.createGain();
    rainBus.gain.value = 0;
    rainBus.connect(master);

    const rainBody = connectNoise(rainBus, white, "highpass", 760, 0.6, 0.2);
    const rainTop = ctx.createBiquadFilter();
    rainTop.type = "lowpass";
    rainTop.frequency.value = 7600;
    rainBody.source.disconnect();
    rainBody.source.connect(rainBody.filter);
    rainBody.filter.disconnect();
    rainBody.filter.connect(rainTop).connect(rainBody.gain);
    rainBody.gain.gain.value = 0.36;

    connectNoise(rainBus, white, "bandpass", 3300, 0.5, 0.1);

    const rainPadGain = ctx.createGain();
    rainPadGain.gain.value = 0.007;
    rainPadGain.connect(rainBus);
    for (const frequency of [220, 261.63, 329.63]) {
      const pad = ctx.createOscillator();
      pad.type = "triangle";
      pad.frequency.value = frequency;
      pad.connect(rainPadGain);
      pad.start();
    }

    built = true;
    applyMix();
    return true;
  }

  function applyMix() {
    if (!ctx) return;
    ramp(cityBus.gain, stage === "night" ? 1 : 0, ctx);
    ramp(villageBus.gain, stage === "village" ? 1 : 0, ctx);
    ramp(alpsBus.gain, stage === "alps" ? 1 : 0, ctx);
    ramp(tokyoBus.gain, stage === "tokyo" ? 1 : 0, ctx);
    ramp(rainBus.gain, rainOn ? 1 : 0, ctx);
    ramp(master.gain, muted ? 0 : MASTER_LEVEL, ctx, 0.25);
  }

  function ensure() {
    if (!built && !build()) return false;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    applyMix();
    return true;
  }

  function setStage(kind) {
    stage =
      kind === "night" || kind === "village" || kind === "alps" || kind === "tokyo"
        ? kind
        : null;
    if (!ctx) return;
    ramp(cityBus.gain, stage === "night" ? 1 : 0, ctx, 0.8);
    ramp(villageBus.gain, stage === "village" ? 1 : 0, ctx, 0.8);
    ramp(alpsBus.gain, stage === "alps" ? 1 : 0, ctx, 0.8);
    ramp(tokyoBus.gain, stage === "tokyo" ? 1 : 0, ctx, 0.8);
    if (stage === "night") {
      nextHorn = ctx.currentTime + randomBetween(1.6, 4.2);
    } else if (stage === "village") {
      nextBird = ctx.currentTime + randomBetween(0.4, 1.8);
    } else if (stage === "alps") {
      nextAlpsNote = ctx.currentTime + randomBetween(0.8, 2.0);
      nextAlpsBell = ctx.currentTime + randomBetween(8, 16);
    } else if (stage === "tokyo") {
      nextTokyoBell = ctx.currentTime + randomBetween(4, 9);
      nextTokyoTrain = ctx.currentTime + randomBetween(8, 16);
    }
  }

  function setRain(on) {
    rainOn = Boolean(on);
    if (!ctx) return;
    ramp(rainBus.gain, rainOn ? 1 : 0, ctx, 1.1);
    if (rainOn) nextDrop = ctx.currentTime + 0.15;
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (!ctx) return;
    ramp(master.gain, muted ? 0 : MASTER_LEVEL, ctx, 0.25);
  }

  function playHorn() {
    if (!ctx || !cityBus) return;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = randomBetween(-0.75, 0.75);
    const gain = ctx.createGain();
    // The horn is a foreground event, not part of the bed. It needs enough
    // level to read over the engine and rain without clipping.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.165, t + 0.025);
    gain.gain.setValueAtTime(0.165, t + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    filter.connect(gain).connect(pan).connect(cityBus);
    for (const frequency of [392, 494]) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(frequency, t);
      osc.frequency.setValueAtTime(frequency, t + 0.18);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.94, t + 0.38);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 0.44);
    }
  }

  function playBird() {
    if (!ctx || !villageBus) return;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = randomBetween(-0.85, 0.85);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.017, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    gain.connect(pan).connect(villageBus);
    for (let i = 0; i < 2; i++) {
      const start = t + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const base = randomBetween(2450, 3150);
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * 1.3, start + 0.06);
      osc.frequency.exponentialRampToValueAtTime(base * 0.86, start + 0.15);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + 0.17);
    }
  }

  function playDrop() {
    if (!ctx || !rainBus) return;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = randomBetween(-0.9, 0.9);
    const gain = ctx.createGain();
    const frequency = randomBetween(1500, 4200);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(randomBetween(0.004, 0.012), t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, t);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.52, t + 0.075);
    osc.connect(gain).connect(pan).connect(rainBus);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  const ALPINE_SCALE = [293.66, 369.99, 440, 493.88, 587.33, 659.25, 739.99];

  function alpsTone(frequency, start, duration, level, pan) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.32);
    gain.gain.setValueAtTime(level, start + duration * 0.56);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2100;
    filter.Q.value = 0.4;
    filter.connect(gain).connect(panner).connect(alpsBus);
    for (const [type, ratio, partial] of [
      ["triangle", 1, 1],
      ["sine", 2, 0.22],
      ["sine", 3, 0.07],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency * ratio;
      const partialGain = ctx.createGain();
      partialGain.gain.value = partial;
      osc.connect(partialGain).connect(filter);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    }
  }

  // A sparse alphorn call, phrased slowly and left to ring across the valley.
  function playAlpsPhrase() {
    if (!ctx || !alpsBus) return;
    const t = ctx.currentTime + 0.03;
    const root = ALPINE_SCALE[Math.floor(Math.random() * ALPINE_SCALE.length)];
    const pan = randomBetween(-0.45, 0.45);
    const level = randomBetween(0.012, 0.019);
    alpsTone(root, t, 2.9, level, pan);
    if (Math.random() > 0.32) {
      const answer = ALPINE_SCALE[Math.floor(Math.random() * ALPINE_SCALE.length)];
      alpsTone(answer, t + 1.2, 2.4, level * 0.72, pan * 0.7);
    }
    if (Math.random() > 0.58) {
      alpsTone(root * 0.5, t, 3.6, level * 0.5, pan * 0.35);
    }
  }

  function playAlpsBell() {
    if (!ctx || !alpsBus) return;
    const t = ctx.currentTime + 0.02;
    const base = Math.random() > 0.5 ? 523.25 : 659.25;
    const pan = randomBetween(-0.8, 0.8);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(alpsBus);
    for (const [ratio, level, decay] of [
      [1, 0.014, 3.4],
      [2.76, 0.006, 2.1],
      [5.4, 0.003, 1.3],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = base * ratio;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(gain).connect(panner);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  }

  // A level crossing warning: six alternating strikes of a small bell, then
  // silence while the train passes. Kept dry and distant so it colours the bed
  // rather than sounding like an alarm inside the car.
  function playTokyoCrossing() {
    if (!ctx || !tokyoBus) return;
    const t = ctx.currentTime + 0.02;
    const panner = ctx.createStereoPanner();
    panner.pan.value = randomBetween(-0.62, 0.62);
    panner.connect(tokyoBus);
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.36;
      const base = i % 2 === 0 ? 784 : 587.33;
      for (const [ratio, level, decay] of [
        [1, 0.02, 0.3],
        [2.01, 0.006, 0.18],
      ]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = base * ratio;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        osc.connect(gain).connect(panner);
        osc.start(at);
        osc.stop(at + decay + 0.04);
      }
    }
  }

  // The elevated line: a low swell of rolling stock, wheel clacks and the
  // brief wash of air as it crosses the end of the street.
  function playTokyoTrain() {
    if (!ctx || !tokyoBus) return;
    const t = ctx.currentTime + 0.02;
    const panner = ctx.createStereoPanner();
    panner.pan.value = randomBetween(-0.72, 0.72);
    panner.connect(tokyoBus);

    const swell = ctx.createGain();
    swell.gain.setValueAtTime(0.0001, t);
    swell.gain.exponentialRampToValueAtTime(0.05, t + 1.1);
    swell.gain.setValueAtTime(0.05, t + 2.4);
    swell.gain.exponentialRampToValueAtTime(0.0001, t + 4.3);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(170, t);
    filter.frequency.linearRampToValueAtTime(420, t + 1.7);
    filter.frequency.linearRampToValueAtTime(140, t + 4.3);
    const source = ctx.createBufferSource();
    source.buffer = noiseHit;
    source.loop = true;
    source.connect(filter).connect(swell).connect(panner);
    source.start(t);
    source.stop(t + 4.35);

    for (let i = 0; i < 15; i++) {
      const at = t + 0.45 + i * 0.255;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.017, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.085);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(randomBetween(88, 126), at);
      osc.connect(gain).connect(panner);
      osc.start(at);
      osc.stop(at + 0.1);
    }
  }


  /**
   * Small procedural foley hits for the Date sequence. These are deliberately
   * short and dry: a door latch, a seatbelt, heels on stone, glassware and a
   * wine pour. They sit under the ambience bed and give the scripted beats a
   * physical edge without shipping a single audio file.
   */
  function foley(kind, options = {}) {
    if (!ctx || muted || ctx.state !== "running" || !noiseHit) return false;
    const start = ctx.currentTime + 0.008;
    const level = Math.min(0.8, Math.max(0.02, Number(options.level) || 0.22));
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, Number(options.pan) || 0));
    panner.connect(master);
    const bus = ctx.createGain();
    bus.gain.value = level;
    bus.connect(panner);

    const tone = (at, frequency, duration, peak = 0.2, type = "sine") => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, at);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(bus);
      osc.start(at);
      osc.stop(at + duration + 0.03);
    };

    const noise = (
      at,
      duration,
      { type = "bandpass", frequency = 900, q = 0.9, peak = 0.3, sweepTo = 0 } = {}
    ) => {
      const source = ctx.createBufferSource();
      source.buffer = noiseHit;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(frequency, at);
      filter.Q.value = q;
      if (sweepTo > 0) {
        filter.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);
      }
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      source.connect(filter).connect(gain).connect(bus);
      source.start(at, Math.random() * 0.55, duration + 0.02);
      source.stop(at + duration + 0.03);
    };

    switch (kind) {
      case "door": {
        tone(start, 74, 0.2, 0.42);
        tone(start, 122, 0.11, 0.14);
        noise(start, 0.1, { frequency: 560, peak: 0.16 });
        tone(start + 0.07, 1750, 0.035, 0.05, "square");
        break;
      }
      case "door-close": {
        tone(start, 58, 0.26, 0.55);
        tone(start, 96, 0.16, 0.2);
        noise(start, 0.14, { frequency: 380, peak: 0.22 });
        tone(start + 0.05, 1350, 0.04, 0.045, "square");
        break;
      }
      case "seatbelt": {
        noise(start, 0.07, { type: "highpass", frequency: 1500, peak: 0.28 });
        tone(start + 0.015, 2100, 0.03, 0.07, "square");
        noise(start + 0.12, 0.24, { frequency: 680, q: 0.7, peak: 0.12 });
        break;
      }
      case "steps": {
        const count = Math.max(1, Math.min(6, Number(options.count) || 3));
        const spacing = Number(options.spacing) || 0.3;
        for (let i = 0; i < count; i++) {
          const at = start + i * spacing;
          noise(at, 0.075, { frequency: 420, q: 1.1, peak: 0.2 });
          tone(at, 96, 0.07, 0.07);
          tone(at + 0.01, 1550, 0.025, 0.025, "square");
        }
        break;
      }
      case "glass": {
        tone(start, 1480, 0.55, 0.16);
        tone(start + 0.006, 2230, 0.34, 0.07);
        tone(start + 0.01, 3020, 0.2, 0.035);
        break;
      }
      case "cutlery": {
        tone(start, 2480, 0.14, 0.1);
        tone(start + 0.004, 3720, 0.09, 0.05);
        noise(start, 0.045, { type: "highpass", frequency: 2800, peak: 0.09 });
        break;
      }
      case "pour": {
        noise(start, 0.72, {
          frequency: 760,
          q: 0.7,
          peak: 0.16,
          sweepTo: 1250,
        });
        for (let i = 0; i < 5; i++) {
          const at = start + 0.1 + i * 0.11 + Math.random() * 0.04;
          tone(at, 380 + Math.random() * 220, 0.06, 0.035);
        }
        break;
      }
      case "doorbell": {
        tone(start, 880, 1.15, 0.12);
        tone(start + 0.19, 1320, 0.95, 0.08);
        break;
      }
      case "whoosh": {
        noise(start, 0.5, {
          frequency: 260,
          q: 0.8,
          peak: 0.12,
          sweepTo: 1100,
        });
        break;
      }
      default:
        return false;
    }
    return true;
  }

  function pickVoice() {
    const synth = window.speechSynthesis;
    if (!synth?.getVoices) return null;
    const voices = synth.getVoices();
    if (!voices.length) return null;
    const english = voices.filter((voice) => /^en/i.test(voice.lang || ""));
    const warm =
      /female|samantha|zira|aria|jenny|serena|karen|moira|tessa|victoria|sonia|libby|google uk english female|google us english/i;
    return (
      english.find((voice) => warm.test(voice.name || "")) ||
      english.find((voice) => /en-GB/i.test(voice.lang || "")) ||
      english[0] ||
      null
    );
  }

  /**
   * Speak a scripted line with the platform voice. `pitch` and `rate` shape the
   * character; volume stays below the music bed so a line never overwhelms the
   * scene. Returns false when the browser has no speech synthesis.
   */
  function speak(text, options = {}) {
    if (!text || muted) return false;
    const synth = window.speechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    if (!synth || typeof Utterance !== "function") return false;
    try {
      speechVoice = speechVoice || pickVoice();
      const utterance = new Utterance(String(text));
      if (speechVoice) utterance.voice = speechVoice;
      utterance.pitch = Math.min(
        2,
        Math.max(0.5, Number(options.pitch) || 1)
      );
      utterance.rate = Math.min(1.6, Math.max(0.6, Number(options.rate) || 0.95));
      const volume = Number(options.volume);
      utterance.volume = Math.min(
        1,
        Math.max(0.05, Number.isFinite(volume) ? volume : 0.55)
      );
      if (synth.speaking || synth.pending) synth.cancel();
      synth.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  function update(dt, speed = 0) {
    if (!ctx || ctx.state !== "running" || muted) return;
    const now = ctx.currentTime;

    if (stage === "night") {
      if (cityHum) {
        cityHum.frequency.setTargetAtTime(
          44 + Math.min(38, speed * 0.72),
          now,
          0.35
        );
      }
      if (now >= nextHorn) {
        playHorn();
        nextHorn = now + randomBetween(6, 16);
      }
    } else if (stage === "village") {
      if (now >= nextBird) {
        playBird();
        nextBird = now + randomBetween(2.2, 6.5);
      }
    } else if (stage === "alps") {
      if (now >= nextAlpsNote) {
        playAlpsPhrase();
        nextAlpsNote = now + randomBetween(3.4, 6.8);
      }
      if (now >= nextAlpsBell) {
        playAlpsBell();
        nextAlpsBell = now + randomBetween(17, 31);
      }
      if (alpsWindGain) {
        alpsWindGain.gain.setTargetAtTime(
          0.15 + 0.055 * Math.sin(now * 0.19),
          now,
          0.8
        );
      }
    } else if (stage === "tokyo") {
      if (now >= nextTokyoBell) {
        playTokyoCrossing();
        nextTokyoBell = now + randomBetween(19, 36);
      }
      if (now >= nextTokyoTrain) {
        playTokyoTrain();
        nextTokyoTrain = now + randomBetween(24, 46);
      }
    }

    if (rainOn && now >= nextDrop) {
      playDrop();
      nextDrop = now + randomBetween(0.06, 0.2);
    }

    // Keep the wind bed alive even when the scene is paused on a frame; the
    // LFO handles the swell, this just prevents a static loop from sounding
    // like a tape hiss.
    if (villageBus && windGain && stage === "village") {
      windGain.gain.setTargetAtTime(
        0.17 + 0.05 * Math.sin(now * 0.23),
        now,
        0.6
      );
    }
  }

  return {
    ensure,
    setStage,
    setRain,
    setMuted,
    update,
    speak,
    foley,
    get muted() {
      return muted;
    },
    get ready() {
      return built && ctx?.state === "running";
    },
    get stage() {
      return stage;
    },
    get rain() {
      return rainOn;
    },
  };
}
