import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HEROES } from '../../lib/game/data.js';
import { Game } from '../../lib/game/engine.js';
import { voiceChoices } from '../../lib/game/voices.js';

const voiceRoot = new URL('../../public/assets/voice/', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('characters.json', voiceRoot)));
const narration = JSON.parse(readFileSync(new URL('manifest.json', voiceRoot)));
const revisions = ['85baa7489157c023bb2528a40ce4ef4e12863387', 'aaf2ef365c6a0a0d0932a4e0506d09342835e202'];

function verifyClip(clip) {
    assert(revisions.includes(clip.source.revision));
    assert.equal(clip.file, `qsanguosha/${clip.source.revision.slice(0, 12)}/${clip.source.path.slice('audio/'.length)}`);
    assert(clip.file.endsWith('.ogg'));
    const bytes = readFileSync(new URL(clip.file, voiceRoot));
    assert(bytes.length > 1000, clip.file);
    assert.equal(bytes.subarray(0, 4).toString(), 'OggS');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256, clip.file);
}

test('every character maps authentic source recordings or explicitly documents missing skills', () => {
    const files = new Set(), unavailable = [];
    let skillCount = 0;
    assert.equal(catalog.provider, 'Mogara/QSanguosha');
    for (const hero of HEROES) {
        const profile = catalog.characters[hero.id];
        assert.equal(profile.name, hero.name);
        assert.deepEqual([...Object.keys(profile.skills), ...Object.keys(profile.unavailable)].sort(), hero.skill.split(' · ').sort());
        assert(Object.keys(profile.skills).length > 0, `${hero.name} has no skill recording`);
        for (const skill of Object.keys(profile.unavailable)) {
            unavailable.push(`${hero.id}:${skill}`);
            assert(profile.unavailable[skill].includes('没有'));
            assert.deepEqual(voiceChoices(skill, { hero }, catalog.characters, narration), []);
        }
        for (const [skill, clips] of Object.entries(profile.skills)) {
            skillCount++;
            assert.equal(clips.length, skill === '红颜' ? 1 : 2);
            for (const clip of clips) {
                verifyClip(clip);
                assert(!files.has(clip.file), 'do not borrow another general’s skill recording');
                files.add(clip.file);
                const transcript = readFileSync(new URL(`qsanguosha/transcripts/${clip.source.revision.slice(0, 12)}/${clip.source.transcript.split('/').pop()}`, voiceRoot), 'utf8');
                const key = clip.source.path.split('/').pop().slice(0, -4);
                assert(transcript.includes(`"$${key}"`));
                assert(transcript.includes(`"${clip.text}"`));
            }
        }
    }
    assert.equal(files.size, 105);
    assert.equal(skillCount, 53);
    assert.deepEqual(unavailable, ['machao:马术', 'huangyueying:奇才', 'pangde:马术']);
    assert.equal(catalog.characters.guanyu.skills['武圣'][0].sha256, '00e8b6fee72b9233d3797dd6c02e6be18baf0070e688cf827bebc3ecad10b073');
    assert.equal(catalog.characters.zhouyu.skills['英姿'][0].source.path, 'audio/skill/yingzi_zhouyu1.ogg');
    assert.equal(catalog.characters.yuji.skills['蛊惑'][0].source.revision, revisions[1]);
});

test('original male and female card voices replace synthetic narration without hidden identity leaks', () => {
    const guanyu = HEROES.find(hero => hero.id === 'guanyu');
    const diaochan = HEROES.find(hero => hero.id === 'diaochan');
    assert.equal(Object.keys(narration).length, 14);
    for (const [word, variants] of Object.entries(narration)) {
        for (const sex of ['male', 'female']) {
            verifyClip(variants[sex]);
            assert(variants[sex].source.path.startsWith(`audio/card/${sex}/`));
        }
        assert.deepEqual(voiceChoices(word, { hero: guanyu }, catalog.characters, narration), [variants.male]);
        assert.deepEqual(voiceChoices(word, { hero: diaochan }, catalog.characters, narration), [variants.female]);
        const hidden = { generals: [diaochan, guanyu], revealed: [false, false] };
        assert.deepEqual(voiceChoices(word, hidden, catalog.characters, narration), [variants.male]);
        hidden.revealed[0] = true;
        assert.deepEqual(voiceChoices(word, hidden, catalog.characters, narration), [variants.female]);
    }
    for (const word of ['开局', '即将超时', '马术', '奇才', 'unknown']) {
        assert.deepEqual(voiceChoices(word, null, catalog.characters, narration), []);
    }
});

test('source credits and material license are shipped alongside unmodified original files', () => {
    assert.equal(catalog.source.license, 'CC-BY-NC-ND-4.0');
    assert.equal(catalog.source.repository, 'https://github.com/Mogara/QSanguosha');
    assert.equal(catalog.source.revision, revisions[0]);
    assert.equal(catalog.source.historicalRevision, revisions[1]);
    const credits = readFileSync(new URL(catalog.source.credits, voiceRoot), 'utf8');
    assert(credits.includes('Mogara/QSanguosha'));
    assert(credits.includes('CC BY-NC-ND 4.0'));
    for (const revision of revisions) assert(credits.includes(revision));
    assert(readFileSync(new URL('qsanguosha/LICENSE.txt', voiceRoot), 'utf8').includes('Attribution-NonCommercial-NoDerivatives 4.0'));
    assert(!readdirSync(voiceRoot).some(file => file.endsWith('.mp3')), 'obsolete synthetic narration must not ship');
});

test('skill voices follow the revealed deputy and do not expose hidden generals', () => {
    const game = new Game('guanyu', 'normal', {}, 4, { mode: 'national', deputy: 'zhangfei' });
    const player = game.players[0];
    assert.deepEqual(voiceChoices('咆哮', player, catalog.characters, narration), []);
    game.reveal(0, 1);
    assert.deepEqual(voiceChoices('咆哮', player, catalog.characters, narration), catalog.characters.zhangfei.skills['咆哮']);
    assert.deepEqual(voiceChoices('武圣', player, catalog.characters, narration), []);
    assert.deepEqual(voiceChoices('杀', player, catalog.characters, narration), [narration['杀'].male]);
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
