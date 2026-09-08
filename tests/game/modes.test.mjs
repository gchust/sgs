import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../lib/game/engine.js';
import { HEROES, suitRed } from '../../lib/game/data.js';
import { hasHero, playerName, playerFemale } from '../../lib/game/players.js';
import { normalizeConfig, validateSave } from '../../lib/game/modes.js';
const hero = id => HEROES.find(h => h.id === id);
const national = (main = 'guanyu', deputy = 'zhangfei', count = 6, hooks = {}) => new Game(main, 'normal', hooks, count, { mode: 'national', deputy });
function setPair(p, a, b) { p.hero = hero(a); p.generals = [hero(a), hero(b)]; p.revealed = [false, false]; p.team = null; }
function discardHands(g) { for (const p of g.players) { g.discard.push(...p.hand); p.hand = []; } }

test('national tables use distinct, same-faction pairs and averaged HP without lord bonus', () => {
    for (const count of [4, 5, 6, 7]) for (const main of HEROES) {
        const g = new Game(main.id, 'normal', {}, count, { mode: 'national' });
        assert.equal(g.players.length, count);
        assert.equal(new Set(g.players.flatMap(p => p.generals.map(h => h.id))).size, count * 2);
        for (const p of g.players) {
            assert.equal(p.generals[0].faction, p.generals[1].faction);
            assert.equal(p.max, Math.floor(p.generals.reduce((n, h) => n + h.hp, 0) / 2));
            assert.deepEqual(p.revealed, [false, false]); assert.equal(p.team, null); assert.equal(p.hand.length, 4);
        }
        assert(g.players.some(p => p.hero.faction !== main.faction));
    }
    assert.throws(() => national('guanyu', 'caocao'), /同势力/);
    assert.throws(() => national('guanyu', 'guanyu'), /同势力/);
});

test('only revealed generals grant skills, and main/deputy skills work together', () => {
    const g = national(), p = g.players[0], t = g.players[1];
    const red = { type: 'tao', suit: '♥', rank: '3', id: 990 };
    assert.equal(playerName(p), '第1席'); assert.equal(playerFemale(p), null);
    assert(!g.conversions(p, red).includes('sha'));
    p.used.sha = 1;
    assert.match(g.valid(p, { type: 'sha' }, t), /本回合/);
    g.reveal(0, 1);
    assert(hasHero(p, 'zhangfei')); assert(!hasHero(p, 'guanyu'));
    assert.equal(playerName(p), '张飞'); assert(!g.conversions(p, red).includes('sha'));
    assert.equal(g.valid(p, { type: 'sha' }, t), null);
    g.reveal(0, 0);
    assert(g.conversions(p, red).includes('sha')); assert.equal(g.valid(p, red, t, 'sha'), null);
    assert.equal(playerName(p), '关羽·张飞');
    assert.equal(g.history.filter(e => e.name === '亮将').length, 2);
});

test('deputy Hongyan and gender become active only after revealing that general', () => {
    const g = national('sunquan', 'xiaoqiao'), p = g.players[0];
    const spade = { type: 'sha', suit: '♠' };
    assert.equal(suitRed(p, spade), false); assert.equal(playerFemale(p), null);
    g.reveal(0, 1); assert.equal(suitRed(p, spade), true); assert.equal(playerFemale(p), true);
    g.reveal(0, 0); assert.equal(playerFemale(p), false);
});

test('hidden generals never appear in public card logs and AI does not peek at hidden targets', async () => {
    const g = national(), p = g.players[0], t = g.players[1];
    const names = [...p.generals, ...t.generals].map(h => h.name);
    assert.equal(g.relation(p, t), 0);
    setPair(t, 'caocao', 'simayi'); assert.equal(g.relation(p, t), 0);
    await g.show(p, { type: 'sha', id: 999, suit: '♠', rank: 'A' }, 'sha', t);
    const text = g.history[0].text;
    for (const name of names) assert(!text.includes(name));
    assert.match(text, /第1席.*第2席/);
    g.reveal(t.id, 0); assert.equal(g.relation(p, t), -1);
});

test('conversion responses may reveal a hidden deputy before consuming the card', async () => {
    let prompts = 0;
    const g = national('guanyu', 'zhaoyun', 4, { ask: async (_title, options) => {
        prompts++;
        return options.find(o => o.value === 'reveal:1')?.value ?? options[0]?.value;
    } });
    const p = g.players[0]; discardHands(g);
    const c = g.pile.find(c => c.type === 'sha'); g.pile.splice(g.pile.indexOf(c), 1); p.hand.push(c);
    assert(await g.respond(p, 'shan', '请打出闪'));
    assert.equal(prompts, 2); assert.deepEqual(p.revealed, [false, true]); assert.equal(p.hand.length, 0);
    assert.equal(g.table.at(-1).by, '赵云'); assert.equal(g.table.at(-1).type, 'shan');
});

test('play-phase reveal is available even with an empty hand; preparation can stay hidden', async () => {
    const g = national('guanyu', 'zhangfei', 4, { ask: async () => null });
    assert(await g.begin(0)); assert.deepEqual(g.players[0].revealed, [false, false]);
    discardHands(g);
    assert(await g.skill(0, 'reveal:1')); assert.deepEqual(g.players[0].revealed, [false, true]);
    assert.equal(await g.skill(0, 'reveal:1'), false);
});

test('faction caps count dead members; each wild player is an independent enemy', () => {
    const g = national('guanyu', 'zhangfei', 7);
    g.players.forEach(p => setPair(p, 'guanyu', 'zhangfei'));
    for (let i = 0; i < 3; i++) g.reveal(i, 0);
    g.players[1].alive = false;
    g.reveal(3, 1); g.reveal(4, 0);
    assert.equal(g.players[3].team, 'wild:3'); assert.equal(g.players[4].team, 'wild:4');
    assert.equal(g.relation(g.players[3], g.players[4]), -1);
    assert.equal(g.relation(g.players[0], g.players[2]), 1);
    g.reveal(3, 0); assert.equal(g.players[3].team, 'wild:3'); assert.equal(g.over, false);
});

test('national victory waits for unknown opponents and awards a dead ally the faction win', async () => {
    const g = national('guanyu', 'zhangfei', 4);
    setPair(g.players[1], 'liubei', 'zhaoyun'); setPair(g.players[2], 'caocao', 'simayi'); setPair(g.players[3], 'sunquan', 'ganning');
    discardHands(g); g.reveal(0, 0); g.reveal(1, 0);
    g.players[0].hp = 0; await g.dying(g.players[0], null);
    assert.equal(g.over, false, 'a fallen player must be able to spectate');
    g.players[2].alive = false;
    assert.equal(g.check(), false, 'a hidden survivor still blocks victory');
    g.players[3].alive = false;
    assert.equal(g.check(), 'win'); assert.equal(g.winner, '蜀'); assert.equal(g.resultTitle, '蜀势力获胜');
    const logs = g.history.length; g.check(); assert.equal(g.history.length, logs, 'victory emits once');
});

test('national friendly kills discard all resources; revealed enemy kills draw two; hidden kills draw none', async () => {
    const g = national('guanyu', 'zhangfei', 6), [p, ally, enemy, hiddenEnemy] = g.players;
    setPair(ally, 'liubei', 'zhaoyun'); setPair(enemy, 'caocao', 'simayi'); setPair(hiddenEnemy, 'sunquan', 'ganning');
    discardHands(g); g.reveal(p.id, 0); g.reveal(ally.id, 0);
    p.equip.weapon = g.pile.find(c => c.type === 'zhuge'); g.pile.splice(g.pile.indexOf(p.equip.weapon), 1);
    const costs = g.pile.filter(c => c.type === 'sha').slice(0, 2);
    g.pile = g.pile.filter(c => !costs.includes(c)); p.hand.push(...costs); ally.hp = 0; await g.dying(ally, p);
    assert.equal(p.hand.length, 0); assert.deepEqual(p.equip, {});
    enemy.hp = 0; await g.dying(enemy, p); assert.equal(p.hand.length, 2);
    discardHands(g);
    const hiddenKiller = g.players[4]; hiddenEnemy.hp = 0; await g.dying(hiddenEnemy, hiddenKiller);
    assert.equal(hiddenKiller.hand.length, 0);
});

test('Buqu plus Lianying can finish discarding at zero HP without a draw/discard loop', async () => {
    const g = national('zhoutai', 'luxun', 4), p = g.players[0];
    g.reveal(0, 'both'); p.hp = 0; g.turn = 0;
    await g.finish(0);
    assert.equal(p.alive, true); assert.equal(p.hand.length, 0); assert.equal(g.phase, '结束');
});

test('duel forces two seats and ends without identity HP or kill rewards', async () => {
    const g = new Game('guanyu', 'normal', {}, 7, { mode: 'duel' });
    assert.equal(g.count, 2); assert.equal(g.players[0].max, 4); assert(g.players.every(p => p.role === 'duel'));
    assert.equal(g.relation(g.players[0], g.players[1]), -1);
    g.players[1].hero = hero('caocao'); // Keep this reward test independent of survival skills such as 不屈.
    discardHands(g); g.players[1].hp = 0; await g.dying(g.players[1], g.players[0]);
    assert.equal(g.over, 'win'); assert.equal(g.players[0].hand.length, 0); assert.match(g.resultTitle, /单挑/);
});

test('mode configuration and saves preserve national pairs and accept existing v2 identity saves', () => {
    const config = normalizeConfig({ mode: 'national', hero: 'caocao', deputy: 'zhangfei', count: 2 });
    assert.equal(config.count, 6); assert.equal(hero(config.deputy).faction, '魏');
    assert.equal(normalizeConfig({ ...config, mode: 'duel' }).count, 2);
    for (const mode of ['identity', 'national', 'duel']) {
        const g = new Game('guanyu', 'normal', {}, 6, { mode }); g.phase = '出牌';
        if (mode === 'national') g.reveal(0, 1);
        const saved = JSON.parse(JSON.stringify({ ...g, v: mode === 'identity' ? 2 : 3 }));
        if (mode === 'identity') delete saved.mode;
        assert(validateSave(saved));
        const restored = Object.assign(new Game(), saved, { mode: saved.mode || 'identity' });
        assert.equal(restored.mode, mode);
        if (mode === 'national') {
            assert.deepEqual(restored.players[0].revealed, [false, true]);
            saved.players[0].generals[1] = hero('caocao'); assert.equal(validateSave(saved), false);
        }
    }
});

test('all 39 generals finish national 4/6/7 and duel matches with unique physical cards', async () => {
    let seed = 1872026; const random = Math.random;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    try {
        for (const [mode, count] of [['national', 4], ['national', 6], ['national', 7], ['duel', 2]]) for (const h of HEROES) {
            let events = 0;
            const g = new Game(h.id, 'normal', { update: () => { if (++events > 20000) throw new Error(`${mode}/${h.name}/${count}: runaway event chain`); } }, count, { mode });
            for (let round = 1; round <= 180 && !g.over; round++) {
                g.round = round;
                for (const p of g.players) {
                    if (!p.alive || g.over) continue;
                    if (await g.begin(p.id)) await g.ai(p.id);
                    await g.finish(p.id);
                    const ids = [...g.pile, ...g.discard, ...g.players.flatMap(p => [...p.hand, ...Object.values(p.equip), ...p.delays, ...p.scars])].map(c => c.id);
                    assert.equal(new Set(ids).size, ids.length, `${mode}/${h.name}/${count}/round${round}: duplicate card`);
                    assert(g.players.every(p => p.hp <= p.max));
                }
            }
            assert(g.over, `${mode}/${h.name}/${count}: unfinished after 180 rounds`);
        }
    } finally { Math.random = random; }
});
