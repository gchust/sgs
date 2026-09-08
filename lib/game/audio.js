import manifest from '../../public/assets/voice/manifest.json';
import { MusicPlayer } from './music.js';
import { assetUrl } from './assets.js';

let context, narration, voiceTail = Promise.resolve(), generation = 0, reported = false;
const buffers = new Map();
const music = new MusicPlayer({ notify: detail => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('game-music-state', { detail }));
} });
export function syncMusic(config) { music.configure(config); }
export function playMusic(config) { unlockAudio(); music.start(context, config); }
export function stopMusic() { music.stop(); }
export function setMusicHidden(hidden) { music.setHidden(hidden); }
export function unlockAudio() {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    context ||= new AudioContext();
    if (context.state === 'suspended') context.resume().catch(reportError);
}
function reportError() {
    if (reported) return;
    reported = true;
    window.dispatchEvent(new Event('game-audio-error'));
}
export function stopAudio() {
    generation++;
    narration?.stop();
    narration = null;
    music.duck(false);
    voiceTail = Promise.resolve();
}
export function waitForVoice() { return voiceTail; }
async function voice(word, volume, token) {
    const clip = manifest[word];
    if (!clip || !context || context.state !== 'running' || token !== generation) return;
    let buffer = buffers.get(clip.file);
    if (!buffer) {
        const response = await fetch(assetUrl(`assets/voice/${clip.file}.mp3`), { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('Voice clip unavailable');
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        buffers.set(clip.file, buffer);
    }
    if (token !== generation) return;
    await new Promise(resolve => {
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = buffer; gain.gain.value = volume;
        source.connect(gain).connect(context.destination); narration = source;
        // A suspended audio device must not hold game rules indefinitely.
        const watchdog = setTimeout(() => { source.stop(); resolve(); }, buffer.duration * 1000 + 1500);
        source.onended = () => { clearTimeout(watchdog); source.disconnect(); gain.disconnect(); if (narration === source) { narration = null; music.duck(false); } resolve(); };
        music.duck(true);
        source.start();
    });
}
// Distinct layered cues: metal attack, airy shield, low impact, rising healing tones.
function effect(word, volume) {
    if (!context || context.state !== 'running') return;
    const now = context.currentTime, attack = ['杀', '决斗', '南蛮入侵', '万箭齐发'].includes(word), hurt = word === '受伤';
    const shield = ['闪', '无懈可击'].includes(word), heal = ['桃', '桃园结义'].includes(word);
    const gain = context.createGain(); gain.gain.value = volume * .4; gain.connect(context.destination);
    const length = hurt ? .24 : .38;
    if (attack || hurt || shield) {
        const noise = context.createBuffer(1, context.sampleRate * length, context.sampleRate), channel = noise.getChannelData(0);
        for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length) ** 3;
        const source = context.createBufferSource(), filter = context.createBiquadFilter(); source.buffer = noise;
        filter.type = shield ? 'highpass' : 'bandpass'; filter.frequency.setValueAtTime(hurt ? 170 : shield ? 3600 : 1800, now);
        source.connect(filter).connect(gain); source.start(); source.onended = () => { source.disconnect(); filter.disconnect(); };
    }
    const notes = heal ? [392, 494, 587] : shield ? [1175, 1568] : hurt ? [95, 62] : attack ? [185, 277] : [330, 494, 659];
    notes.forEach((frequency, i) => {
        const osc = context.createOscillator(), envelope = context.createGain();
        osc.type = hurt || attack ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(frequency, now);
        const at = now + i * .055;
        envelope.gain.setValueAtTime(.001, now); envelope.gain.exponentialRampToValueAtTime(.25, at + .008); envelope.gain.exponentialRampToValueAtTime(.001, at + .32);
        osc.connect(envelope).connect(gain); osc.start(at); osc.stop(at + .34); osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
    });
    setTimeout(() => gain.disconnect(), 1000);
}
export function playSound(word, config) {
    if (typeof window === 'undefined') return;
    if (config.sfx) effect(word, (config.sfxVolume ?? 45) / 100);
    if (config.voice && manifest[word]) {
        const token = generation;
        voiceTail = voiceTail.then(() => voice(word, (config.voiceVolume ?? 80) / 100, token)).catch(reportError);
    }
    return voiceTail;
}
