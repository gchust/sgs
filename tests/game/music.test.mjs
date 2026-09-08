import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicPlayer, MUSIC_TRACKS } from '../../lib/game/music.js';
import { normalizeConfig } from '../../lib/game/modes.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function rig() {
    const audios = [], tasks = new Map(); let sequence = 0;
    const context = {
        currentTime: 0, destination: {},
        createMediaElementSource: () => ({ connect(node) { return node; }, disconnect() { this.disconnected = true; } }),
        createGain: () => ({ connect() {}, disconnect() { this.disconnected = true; }, gain: { value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; } } }),
    };
    const player = new MusicPlayer({
        createAudio() {
            const audio = { paused: true, currentTime: 0, failure: null, pending: false,
                play() { this.paused = false; if (this.failure) { this.paused = true; return Promise.reject(this.failure); } if (this.pending) return new Promise(resolve => { this.finish = resolve; }); return Promise.resolve(); },
                pause() { this.paused = true; }, removeAttribute() { this.src = ''; }, load() {},
            }; audios.push(audio); return audio;
        },
        schedule(fn, ms) { const id = ++sequence; tasks.set(id, { fn, ms }); return id; },
        cancel(id) { tasks.delete(id); },
    });
    const fire = ms => { for (const [id, task] of [...tasks]) if (task.ms === ms) { tasks.delete(id); task.fn(); } };
    return { player, context, audios, tasks, fire };
}

test('music waits for a user start, streams a local looping track, and resumes at its position', async () => {
    const { player, context, audios } = rig();
    player.configure({ bgm: true }); assert.equal(audios.length, 0);
    player.start(context, { bgm: true, bgmTrack: 'serene', bgmVolume: 28 }); await flush();
    assert.equal(player.status, 'playing'); assert.equal(audios[0].src, '/assets/music/serene.mp3'); assert(audios[0].loop);
    audios[0].currentTime = 47;
    player.configure({ ...player.config, bgm: false }); assert(audios[0].paused);
    player.configure({ ...player.config, bgm: true }); await flush();
    assert.equal(audios.length, 1); assert.equal(audios[0].currentTime, 47); assert.equal(player.status, 'playing');
});

test('voice ducking respects independent music volume and background never overrides music-off', async () => {
    const { player, context, audios } = rig();
    player.start(context, { bgmVolume: 40 }); await flush();
    player.duck(true); assert.equal(player.channel.gain.gain.value, .4 * .23);
    player.configure({ ...player.config, bgmVolume: 20 }); assert.equal(player.channel.gain.gain.value, .2 * .23);
    player.duck(false); assert.equal(player.channel.gain.gain.value, .2);
    player.setHidden(true); assert(audios[0].paused); assert.equal(player.status, 'background');
    player.setHidden(false); await flush(); assert.equal(player.status, 'playing');
    player.setHidden(true); player.configure({ ...player.config, bgm: false }); player.setHidden(false);
    assert(audios[0].paused); assert.equal(player.status, 'paused');
});

test('rapid switching disposes old streams and stale play promises cannot replace the selected track', async () => {
    const { player, context, audios, fire, tasks } = rig();
    player.start(context, {}); await flush(); audios[0].pending = true; audios[0].paused = true;
    player.configure(player.config);
    player.configure({ ...player.config, bgmTrack: 'heroic' });
    player.configure({ ...player.config, bgmTrack: 'joyful' }); await flush();
    audios[0].finish(); await flush(); fire(400);
    assert.equal(player.channel.id, 'joyful'); assert.equal(player.status, 'playing');
    assert(audios[0].paused && audios[1].paused); assert.equal(player.retiring.size, 0);
    player.stop(); assert(audios[2].paused); assert.equal(tasks.size, 0); assert.equal(player.status, 'idle');
});

test('blocked playback can be retried and stalled loading has a bounded failure state', async () => {
    const { player, context, audios, fire } = rig();
    player.start(context, {}); await flush();
    audios[0].pause(); audios[0].failure = Object.assign(new Error('gesture required'), { name: 'NotAllowedError' });
    player.configure(player.config); await flush(); assert.equal(player.status, 'blocked');
    audios[0].failure = null; player.start(context, player.config); await flush(); assert.equal(player.status, 'playing');
    audios[0].pending = true; audios[0].pause(); player.configure(player.config); fire(12000);
    assert.equal(player.status, 'error'); assert(audios[0].paused); assert.equal(player.channel, null);
    player.start(context, player.config); await flush(); audios[0].finish(); await flush();
    assert.equal(audios.length, 2); assert.equal(player.status, 'playing'); assert(audios[0].paused);
    audios[1].onerror(); assert.equal(player.status, 'error');
    player.start(context, player.config); await flush(); assert.equal(player.status, 'playing');
});

test('old settings gain defaults; four credited music files match their declared checksums', () => {
    const config = normalizeConfig({ hero: 'guanyu' });
    assert.equal(config.bgm, true); assert.equal(config.bgmVolume, 28); assert.equal(config.bgmTrack, 'serene');
    assert.equal(normalizeConfig({ bgmTrack: 'invalid', bgmVolume: 999 }).bgmVolume, 100);
    assert.equal(normalizeConfig({ bgm: false }).bgm, false);
    const credits = JSON.parse(readFileSync(new URL('../../public/assets/music/sources.json', import.meta.url)));
    assert.equal(new Set(MUSIC_TRACKS.map(t => t.mood)).size, 4);
    for (const track of MUSIC_TRACKS) {
        const credit = credits.find(c => c.id === track.id);
        assert.equal(credit.title, track.original); assert.equal(credit.source, track.source);
        const bytes = readFileSync(new URL(`../../public/assets/music/${track.id}.mp3`, import.meta.url));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), credit.sha256);
    }
});
