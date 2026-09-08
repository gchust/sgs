import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../lib/game/engine.js';
import { HEROES } from '../../lib/game/data.js';
import { DecisionClock, timeoutChoice } from '../../lib/game/clock.js';

const card = (id, type = 'sha', suit = '♠', rank = '7') => ({ id, type, suit, rank });
function game(hero, ask) {
    const g = new Game(hero, 'normal', ask ? { ask } : {}, 4);
    const other = ['zhangfei', 'guanyu', 'zhaoyun'];
    g.players.forEach((p, i) => {
        if (i) p.hero = HEROES.find(h => h.id === other[i - 1]);
        p.hp = p.max = 4; p.hand = []; p.equip = {}; p.delays = []; p.used = { sha: 0 };
        p.role = i ? 'rebel' : 'lord';
    });
    g.pile = []; g.discard = []; g.phase = '出牌';
    return g;
}

test('countdown pauses during resolution and emits timeout only once', () => {
    const clock = new DecisionClock();
    assert.equal(clock.tick('turn1', 60, 1000, true).seconds, 59);
    assert.equal(clock.tick('turn1', 60, 30000, false).seconds, 59);
    assert.equal(clock.tick('turn1', 60, 58000, true).expired, false);
    assert.equal(clock.tick('turn1', 60, 1000, true).expired, true);
    assert.equal(clock.tick('turn1', 60, 1000, true).expired, false);
    assert.equal(clock.tick('turn2', 60, 0, true).seconds, 60);
    assert.equal(timeoutChoice({ optional: true, options: [{ value: 123 }] }), null);
    assert.equal(timeoutChoice({ optional: false, options: [{ value: 0 }] }), 0);
});

test('response allowance is independent of the ongoing play allowance', () => {
    const play = new DecisionClock(), response = new DecisionClock();
    play.tick('turn1', 60, 10000, true);
    response.tick('prompt1', 20, 19000, true);
    assert.equal(play.tick('turn1', 60, 19000, false).seconds, 50);
    assert.equal(response.tick('prompt1', 20, 1000, true).expired, true);
    assert.equal(response.tick('prompt2', 20, 0, true).seconds, 20);
});

test('强袭 spends one HP, damages the chosen enemy, and can be used only once', async () => {
    const g = game('dianwei');
    await g.skill(0, 'qiangxi');
    assert.equal(g.players[0].hp, 3); assert.equal(g.players[1].hp, 3);
    assert.equal(await g.skill(0, 'qiangxi'), false);
});

test('强袭 cannot use the reach of the weapon it discards', async () => {
    let offered;
    const g = game('dianwei', (title, options) => {
        if (title.includes('选择代价')) return 101;
        if (title.includes('选择攻击范围')) { offered = options.map(o => o.value); return 1; }
        return options[0]?.value ?? null;
    });
    g.players[0].equip.weapon = card(101, 'qinglong');
    await g.skill(0, 'qiangxi');
    assert.deepEqual(offered, [1, 3]);
    assert.equal(g.players[0].equip.weapon, undefined);
    assert.equal(g.players[0].hp, 4);
});

test('马术 adjusts distance and 猛进 discards a card after a successful dodge', async () => {
    const g = game('pangde'), [p, t] = g.players;
    assert.equal(g.dist(p, g.players[2]), 1);
    p.hand = [card(1)]; t.hand = [card(2, 'shan'), card(3, 'tao')];
    await g.play(0, 1, 1);
    assert.equal(t.hp, 4); assert.equal(t.hand.length, 0);
    assert(g.history.some(e => e.name === '猛进'));
});

test('天义 winning grants reach and two slashes; a tie prohibits a slash', async () => {
    const g = game('taishici'), [p, t] = g.players;
    p.hand = [card(1, 'sha', '♠', 'K')]; t.hand = [card(2, 'sha', '♥', '2')];
    await g.skill(0, 'tianyi'); assert.equal(p.used.tianyi, 'win');
    p.used.sha = 1; assert.equal(g.valid(p, card(9), g.players[2]), null);
    p.used.sha = 2; assert.match(g.valid(p, card(9), t), /已使用/);
    const h = game('taishici'); h.players[0].hand = [card(3)]; h.players[1].hand = [card(4)];
    await h.skill(0, 'tianyi'); assert.equal(h.players[0].used.tianyi, 'lose');
    assert.match(h.valid(h.players[0], card(10), h.players[1]), /不能使用杀/);
});

test('乱击 uses two equal-suit cards and resolves each living opponent', async () => {
    const g = game('yuanshao');
    g.players[0].hand = [card(1), card(2, 'tao')];
    await g.skill(0, 'luanji');
    assert.deepEqual(g.players.slice(1).map(p => p.hp), [3, 3, 3]);
    assert.deepEqual(g.discard.map(c => c.id).sort(), [1, 2]);
    assert.equal(g.history.filter(e => e.kind === 'effect').length, 3);
});

test('祸首 is immune to 南蛮 and becomes its damage source', async () => {
    const g = game('menghuo'); g.turn = 1; g.players[1].hand = [card(1, 'nanman')];
    await g.play(1, 1);
    assert.equal(g.players[0].hp, 4);
    assert.deepEqual(g.history.filter(e => e.kind === 'damage').map(e => e.actor), [0, 0]);
});

test('再起 heals for hearts, gains non-hearts, and replaces normal draw', async () => {
    const g = game('menghuo'), p = g.players[0]; p.hp = 2;
    g.pile = [card(3), card(2, 'sha', '♣'), card(1, 'tao', '♥')];
    await g.begin(0);
    assert.equal(p.hp, 3); assert.deepEqual(p.hand.map(c => c.id), [2]);
    assert.deepEqual(g.pile.map(c => c.id), [3]);
});

test('巨象 is immune and receives the physical 南蛮 after all targets settle', async () => {
    const g = game('zhurong'); g.turn = 1; g.players[1].hand = [card(1, 'nanman')];
    await g.play(1, 1);
    assert.equal(g.players[0].hp, 4); assert.deepEqual(g.players[0].hand.map(c => c.id), [1]);
    assert.equal(g.discard.length, 0); assert.equal(g.resolving.size, 0);
});

test('烈刃 compares points after slash damage and gains one enemy card on a win', async () => {
    const g = game('zhurong'), [p, t] = g.players;
    p.hand = [card(1), card(2, 'tao', '♥', 'K')];
    t.hand = [card(3, 'sha', '♣', '2'), card(4, 'tao', '♥', 'A')];
    await g.play(0, 1, 1);
    assert.equal(t.hp, 3); assert.deepEqual(p.hand.map(c => c.id), [4]);
});

test('an equipment card being resolved never enters the reshuffle triggered by 枭姬', async () => {
    const g = game('sunshangxiang'), p = g.players[0];
    p.hand = [card(1, 'qinglong')]; p.equip.weapon = card(2, 'zhuge');
    g.discard = [card(3, 'shan'), card(4, 'tao')];
    await g.play(0, 1);
    const all = [...g.pile, ...g.discard, ...p.hand, ...Object.values(p.equip)].map(c => c.id);
    assert.equal(p.equip.weapon.id, 1); assert.equal(new Set(all).size, all.length);
    assert.equal(g.resolving.size, 0);
});

test('card playback is awaited before damage and battle records retain the target', async () => {
    const g = game('guanyu'); g.players[0].hand = [card(1)];
    let release; g.hooks.effect = e => e.type === 'card' ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
    const playing = g.play(0, 1, 1);
    while (!release) await Promise.resolve();
    assert.equal(g.players[1].hp, 4);
    assert.equal(g.history[0].target, 1); assert.equal(g.table.at(-1).destination, '张飞');
    release(); await playing; assert.equal(g.players[1].hp, 3);
});
