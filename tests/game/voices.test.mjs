import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HEROES } from '../../lib/game/data.js';
import { Game } from '../../lib/game/engine.js';
import { voiceChoices } from '../../lib/game/voices.js';

const catalog = JSON.parse(readFileSync(new URL('../../public/assets/voice/characters.json', import.meta.url)));
const narration = JSON.parse(readFileSync(new URL('../../public/assets/voice/manifest.json', import.meta.url)));

test('every general has two distinct local voice clips for every listed skill', () => {
    const files = new Set(), hashes = new Set(), profiles = new Set();
    for (const hero of HEROES) {
        const profile = catalog.characters[hero.id];
        assert.equal(profile.name, hero.name);
        assert.deepEqual(Object.keys(profile.skills), hero.skill.split(' · '));
        assert.match(profile.voice, hero.female ? /Xiao/ : /Yun/);
        profiles.add(`${profile.voice}:${profile.rate}:${profile.pitch}`);
        for (const [skill, clips] of Object.entries(profile.skills)) {
            assert.equal(clips.length, 2, `${hero.name} ${skill}`);
            assert.notEqual(clips[0].text, clips[1].text);
            for (const clip of clips) {
                assert(clip.text.length > skill.length + 1, 'skills should have dialogue, not just a shouted name');
                assert(!files.has(clip.file), 'characters must not accidentally share one skill recording');
                const bytes = readFileSync(new URL(`../../public/assets/voice/${clip.file}.mp3`, import.meta.url));
                assert(bytes.length > 1000, clip.file);
                const digest = createHash('sha256').update(bytes).digest('hex');
                assert.equal(digest, clip.sha256);
                assert(!hashes.has(digest)); files.add(clip.file); hashes.add(digest);
            }
        }
    }
    assert.equal(profiles.size, HEROES.length);
});

test('skill voices follow the revealed deputy and do not expose hidden generals', () => {
    const game = new Game('guanyu', 'normal', {}, 4, { mode: 'national', deputy: 'zhangfei' });
    const player = game.players[0];
    assert.deepEqual(voiceChoices('咆哮', player, catalog.characters, narration), [narration['咆哮']]);
    game.reveal(0, 1);
    assert.deepEqual(voiceChoices('咆哮', player, catalog.characters, narration), catalog.characters.zhangfei.skills['咆哮']);
    assert.deepEqual(voiceChoices('武圣', player, catalog.characters, narration), [narration['武圣']]);
    assert.deepEqual(voiceChoices('杀', player, catalog.characters, narration), [narration['杀']]);
});

test('same-named skills use the actual character and generic effects keep their fallback', () => {
    for (const id of ['machao', 'pangde']) {
        const hero = HEROES.find(h => h.id === id);
        assert.deepEqual(voiceChoices('马术', { hero }, catalog.characters, narration), catalog.characters[id].skills['马术']);
    }
    assert.deepEqual(voiceChoices('开局', null, catalog.characters, narration), [narration['开局']]);
    assert.deepEqual(voiceChoices('unknown', null, catalog.characters, narration), []);
});

test('skill activations pass their speaker and passive cues are bounded within a turn', async () => {
    const cues = [];
    const game = new Game('guanyu', 'normal', { sound: (word, player) => cues.push({ word, player }) }, 2);
    const player = game.players[0];
    await game.announce(player, '武圣');
    assert.equal(cues[0].word, '武圣'); assert.equal(cues[0].player, player);
    cues.length = 0;
    const converted = { id: 9001, type: 'shan', suit: '♥', rank: '5' };
    await game.show(player, converted, 'sha');
    await game.show(player, converted, 'sha');
    assert.equal(cues.filter(c => c.word === '武圣').length, 1);
    assert.equal(cues.filter(c => c.word === '杀').length, 2);
    game.round++; await game.show(player, converted, 'sha');
    assert.equal(cues.filter(c => c.word === '武圣').length, 2);
    game.cancelled = true; game.skillVoice(player, '武圣');
    assert.equal(cues.filter(c => c.word === '武圣').length, 2);
});

test('hidden national-war skills never emit a character-specific cue', () => {
    const cues = [];
    const game = new Game('guanyu', 'normal', { sound: word => cues.push(word) }, 4, { mode: 'national', deputy: 'zhangfei' });
    game.skillVoice(game.players[0], '武圣');
    game.skillVoice(game.players[0], '咆哮');
    assert.deepEqual(cues, []);
    game.reveal(0, 1); game.skillVoice(game.players[0], '咆哮');
    assert.deepEqual(cues, ['咆哮']);
});
