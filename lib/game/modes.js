import { HEROES, shuffle } from './data.js';
import { musicTrack } from './music.js';

export const MODES = {
    identity: { name: '身份场', short: '身份', counts: [2, 3, 4, 5, 6, 7], title: '各怀身份，谋定天下', description: '主公与忠臣携手，击败反贼和内奸。你担任主公。' },
    duel: { name: '单挑场', short: '单挑', counts: [2], title: '一将一命，正面对决', description: '双方各选一名武将。击败对手即获胜，无主公加血和身份奖励。' },
    national: { name: '国战场', short: '国战', counts: [4, 5, 6, 7], title: '双将同心，合纵连横', description: '同势力双将，暗将入场；亮将结盟，消灭其他势力与野心家。' },
};
export function normalizeConfig(config) {
    const mode = MODES[config.mode] ? config.mode : 'identity';
    const hero = HEROES.find(h => h.id === config.hero) || HEROES[0];
    const deputy = HEROES.find(h => h.id === config.deputy && h.id !== hero.id && h.faction === hero.faction)
        || HEROES.find(h => h.id !== hero.id && h.faction === hero.faction);
    const counts = MODES[mode].counts;
    const count = counts.includes(Number(config.count)) ? Number(config.count) : mode === 'duel' ? 2 : mode === 'national' ? 6 : 7;
    return { ...config, mode, hero: hero.id, deputy: deputy.id, count, bgm: config.bgm !== false, bgmTrack: musicTrack(config.bgmTrack).id, bgmVolume: Number.isFinite(Number(config.bgmVolume)) ? Math.max(0, Math.min(100, Number(config.bgmVolume))) : 28 };
}
export function nationalRoster(hero, deputy, count) {
    if (!deputy || deputy.id === hero.id || deputy.faction !== hero.faction)
        throw new Error('国战主副将必须是两名不同的同势力武将');
    const used = new Set([hero.id, deputy.id]);
    const pairs = [[hero, deputy]];
    for (let i = 1; i < count; i++) {
        const groups = ['魏', '蜀', '吴', '群'].map(faction => shuffle(HEROES.filter(h => h.faction === faction && !used.has(h.id)))).filter(group => group.length >= 2);
        // Give every table both an ally opportunity and an opposing faction.
        const preferred = i === 1 ? groups.filter(g => g[0].faction === hero.faction) : i === 2 ? groups.filter(g => g[0].faction !== hero.faction) : groups;
        const pair = shuffle(preferred.length ? preferred : groups)[0]?.slice(0, 2);
        if (!pair) throw new Error('同势力武将不足');
        pair.forEach(h => used.add(h.id));
        pairs.push(pair);
    }
    return [pairs[0], ...shuffle(pairs.slice(1))];
}

export function validateSave(saved) {
    if (![2, 3].includes(saved?.v) || !Array.isArray(saved.players) || !saved.players[0]?.alive || saved.over || saved.turn !== 0 || saved.phase !== '出牌') return false;
    const mode = saved.mode || 'identity';
    if (!MODES[mode]?.counts.includes(saved.players.length) || saved.count !== saved.players.length) return false;
    const allHeroes = [];
    for (const p of saved.players) {
        if (!HEROES.some(h => h.id === p.hero?.id) || !Array.isArray(p.hand) || !Number.isFinite(p.hp)) return false;
        if (mode === 'national') {
            if (p.generals?.length !== 2 || p.revealed?.length !== 2 || !p.revealed.every(v => typeof v === 'boolean')) return false;
            const pair = p.generals.map(h => HEROES.find(x => x.id === h.id));
            if (pair.some(h => !h) || pair[0].faction !== pair[1].faction || p.hero.id !== pair[0].id) return false;
            if (p.team !== null && p.team !== pair[0].faction && p.team !== `wild:${p.id}`) return false;
            if (p.revealed.some(Boolean) !== Boolean(p.team)) return false;
            allHeroes.push(...pair.map(h => h.id));
        }
    }
    return new Set(allHeroes).size === allHeroes.length;
}
