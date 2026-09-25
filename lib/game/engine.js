import { hasHero, playerName, playerFemale, teamName, visibleGenerals } from './players.js';
import { normalizeConfig, nationalRoster } from './modes.js';
import { HEROES, DEFS, deck, shuffle, isRed, suitRed, slot } from './data.js';
export class Game {
    constructor(hero = 'guanyu', difficulty = 'normal', hooks = {}, count = 7, options = {}) {
        this.hooks = hooks;
        this.difficulty = difficulty;
        const config = normalizeConfig({ hero, count, ...options });
        this.mode = config.mode;
        this.count = config.count;
        this.pile = deck();
        this.discard = [];
        this.resolving = new Set();
        this.logs = [];
        this.history = [];
        this.logId = 0;
        this.table = [];
        this.turn = 0;
        this.round = 1;
        this.phase = '准备';
        this.over = false;
        this.cancelled = false;
        this.revision = 0;
        this.eventId = 0;
        this.voiceTurn = '';
        this.voicedSkills = new Set();
        this.winner = null;
        const rosters = { 2: ['rebel'], 3: ['rebel', 'rebel'], 4: ['loyalist', 'rebel', 'spy'], 5: ['loyalist', 'rebel', 'rebel', 'spy'], 6: ['loyalist', 'rebel', 'rebel', 'rebel', 'spy'], 7: ['loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'spy'] };
        const roles = ['lord', ...shuffle([...rosters[this.count]])];
        const chosen = HEROES.find(h => h.id === config.hero);
        const pairs = this.mode === 'national' ? nationalRoster(chosen, HEROES.find(h => h.id === (options.deputy || config.deputy)), this.count) : null;
        const others = shuffle(HEROES.filter(h => h.id !== chosen.id));
        this.players = (pairs ? pairs.map(pair => pair[0]) : [chosen, ...others.slice(0, this.count - 1)]).map((h, i) => {
            const hp = pairs ? Math.floor((h.hp + pairs[i][1].hp) / 2) : h.hp + (this.mode === 'identity' && i === 0 && this.count >= 5 ? 1 : 0);
            return { id: i, hero: h, role: this.mode === 'identity' ? roles[i] : this.mode, alignment: i === 0 ? 1 : 0,
                ...(pairs ? { generals: pairs[i], revealed: [false, false], team: null } : {}),
                hp, max: hp, hand: [], equip: {}, delays: [], alive: true, flipped: false, used: {}, scars: [] };
        });
        for (const p of this.players)
            this.draw(p, 4);
    }
    motion(type, data = {}) { if (this.cancelled)
        return Promise.resolve(); return this.hooks.effect?.({ type, id: ++this.eventId, ...data }) || Promise.resolve(); }
    prospectiveTeam(p) {
        const faction = p.generals[0].faction;
        return this.players.filter(x => x.team === faction).length >= Math.floor(this.count / 2) ? `wild:${p.id}` : faction;
    }
    reveal(pid, choice = 'both', checkVictory = true) {
        const p = this.players[pid];
        if (this.mode !== 'national' || !p || !['both', 0, 1].includes(choice)) return false;
        const indices = (choice === 'both' ? [0, 1] : [choice]).filter(i => !p.revealed[i]);
        if (!indices.length) return false;
        if (!p.team) p.team = this.prospectiveTeam(p);
        for (const i of indices) p.revealed[i] = true;
        this.log(`第${pid + 1}席亮出${indices.map(i => `${i ? '副将' : '主将'}【${p.generals[i].name}】`).join('、')} · ${teamName(p.team)}`, { kind: 'skill', actor: pid, name: '亮将' });
        if (checkVictory) this.check();
        return true;
    }
    relation(a, b) {
        if (a === b)
            return 1;
        if (this.mode === 'duel') return -1;
        if (this.mode === 'national') {
            if (!b.team) return 0;
            const team = a.team || this.prospectiveTeam(a);
            return team === b.team ? 1 : -1;
        }
        if (b.id === 0)
            return a.role === 'rebel' ? -1 : a.role === 'spy' ? (this.alive().length <= 2 ? -1 : .5) : 1;
        if (a.role === 'lord' || a.role === 'loyalist')
            return b.alignment;
        if (a.role === 'rebel')
            return -b.alignment;
        const knownRebels = this.alive().filter(x => x.alignment < 0).length;
        return knownRebels > this.alive().length / 2 ? b.alignment : -b.alignment;
    }
    observe(a, b, hostile = true) { if (this.mode !== 'identity' || !a || !b || a === b)
        return; const v = b.id === 0 ? 1 : b.alignment; if (v)
        a.alignment = Math.max(-1, Math.min(1, a.alignment + (hostile ? -1 : 1) * v * .7)); }
    emit() { if (!this.cancelled)
        this.hooks.update?.(this); }
    log(text, details = {}) {
        this.logs.unshift(text);
        this.logs = this.logs.slice(0, 300);
        const entry = { id: ++this.logId, round: this.round, turn: this.turn, phase: this.phase, kind: 'info', text, ...details };
        this.history.unshift(entry);
        this.history = this.history.slice(0, 500);
        this.emit();
        return entry;
    }
    async gate() {
        if (this.cancelled) throw new Error('cancelled');
        await this.hooks.beforeEvent?.();
        if (this.cancelled) throw new Error('cancelled');
    }
    async announce(p, name, target) {
        await this.gate();
        this.log(`${playerName(p)}发动【${name}】${target ? ` → ${playerName(target)}` : ''}`, { kind: 'skill', actor: p.id, target: target?.id, name });
        this.hooks.sound?.(name, p);
        await this.motion('skill', { from: p.id, to: target?.id ?? p.id, name });
    }
    skillVoice(p, name) {
        if (this.cancelled || !p || !visibleGenerals(p).some(hero => hero.skill.split(' · ').includes(name))) return;
        const turn = `${this.round}:${this.turn}`;
        if (this.voiceTurn !== turn) { this.voiceTurn = turn; this.voicedSkills.clear(); }
        const key = `${p.id}:${name}`;
        // Repeated passive triggers must not build an unbounded narration queue.
        if (this.voicedSkills.has(key)) return;
        this.voicedSkills.add(key);
        this.hooks.sound?.(name, p);
    }
    async pause() { if (this.cancelled)
        throw new Error('cancelled'); await this.hooks.wait?.(); if (this.cancelled)
        throw new Error('cancelled'); }
    async ask(p, title, options, optional = false) { if (!options.length)
        return null; if (this.cancelled)
        throw new Error('cancelled'); if (p.id === 0 && this.hooks.ask) {
        const r = await this.hooks.ask(title, options, optional, p.id);
        if (this.cancelled)
            throw new Error('cancelled');
        return r;
    } if (optional && title.includes('据守') && p.hp > 2)
        return null; if (optional && title.includes('流离') && this.enemies(p).length < 2)
        return null; return options[0]?.value; }
    take() {
        if (!this.pile.length) {
            this.pile = shuffle(this.discard.filter(c => !this.resolving.has(c.id)));
            this.discard = this.discard.filter(c => this.resolving.has(c.id));
        }
        return this.pile.pop();
    }
    draw(p, n) { let got = 0; for (let i = 0; i < n; i++) {
        let c = this.take();
        if (c) {
            p.hand.push(c);
            got++;
        }
    } if (got)
        this.motion('draw', { to: p.id, n: got }); this.emit(); }
    enemies(p) { return this.players.filter(x => x.alive && x !== p && this.relation(p, x) < .4).sort((a, b) => this.relation(p, a) - this.relation(p, b) || a.hp - b.hp); }
    alive() { return this.players.filter(p => p.alive); }
    dist(a, b) { if (a === b)
        return 0; const living = this.alive(); const diff = Math.abs(living.indexOf(a) - living.indexOf(b)); const base = Math.min(diff, living.length - diff); return Math.max(1, base + (b.equip.horse ? 1 : 0) - (a.equip.offhorse ? 1 : 0) - (['machao', 'pangde'].some(id => hasHero(a, id)) ? 1 : 0)); }
    range(p) { return p.equip.weapon ? DEFS[p.equip.weapon.type][5] : 1; }
    heal(p, n = 1) { if (!p.alive)
        return; let old = p.hp; p.hp = Math.min(p.max, p.hp + n); if (hasHero(p, 'zhoutai') && p.hp > 0)
        p.scars = []; if (old !== p.hp) {
        this.motion('heal', { to: p.id, n: p.hp - old });
        this.log(`${playerName(p)}回复${p.hp - old}点体力，体力 ${p.hp}/${p.max}`, { kind: 'heal', actor: p.id, target: p.id, amount: p.hp - old });
    } }
    remove(p, c) { let i = p.hand.findIndex(x => x.id === c.id); if (i >= 0)
        p.hand.splice(i, 1);
    else {
        let k = Object.keys(p.equip).find(k => p.equip[k]?.id === c.id);
        if (k) {
            delete p.equip[k];
            if (hasHero(p, 'sunshangxiang')) {
                this.draw(p, 2);
                this.skillVoice(p, '枭姬');
                this.log('枭姬：失去装备，摸两张牌');
            }
        }
        else
            p.delays = p.delays.filter(x => x.id !== c.id);
    // Decline the optional 连营 draw at a zero hand limit (e.g. 不屈 + 连营).
    // Otherwise discarding the drawn card immediately draws another forever.
    } if (!p.hand.length && hasHero(p, 'luxun') && !(this.phase === '弃牌' && this.turn === p.id && p.hp <= 0)) {
        this.draw(p, 1);
        this.skillVoice(p, '连营');
        this.log('连营：陆逊摸一张牌');
    } }
    spend(p, c) { this.remove(p, c); this.discard.push(c); }
    async show(p, c, type = c.type, target = null, kind = 'card', context = '') {
        await this.gate();
        const by = playerName(p);
        const destination = playerName(target) || (['nanman', 'wanjian'].includes(type) ? '其他所有角色' : ['taoyuan', 'wugu'].includes(type) ? '所有角色' : kind === 'response' ? '响应' : '自身');
        this.table.push({ ...c, type, by, actor: p.id, target: target?.id, destination, kind, context, seq: ++this.revision });
        this.table = this.table.slice(-12);
        this.log(`${by}${kind === 'response' ? '打出' : '使用'}【${DEFS[type][0]}】 → ${destination}${context ? ` · ${context}` : ''}`, { kind, actor: p.id, target: target?.id, card: { ...c, type }, destination });
        if (type !== c.type) {
            const skill = type === 'sha' && hasHero(p, 'guanyu') && suitRed(p, c) ? '武圣'
                : hasHero(p, 'zhaoyun') && ['sha', 'shan'].includes(type) && ['sha', 'shan'].includes(c.type) ? '龙胆'
                : type === 'shan' && hasHero(p, 'zhenji') ? '倾国'
                : type === 'tao' && hasHero(p, 'huatuo') ? '急救'
                : type === 'guohe' && hasHero(p, 'ganning') ? '奇袭'
                : type === 'lebu' && hasHero(p, 'daqiao') ? '国色' : null;
            if (skill) this.skillVoice(p, skill);
        }
        this.hooks.sound?.(DEFS[type][0], p);
        await this.motion('card', { from: p.id, to: target?.id, card: { ...c, type }, destination, kind });
    }
    cards(p) { return [...p.hand, ...Object.values(p.equip), ...p.delays]; }
    async pick(p, cards, title, optional = false) { return this.ask(p, title, cards.map(c => ({ value: c.id, label: `${c.suit}${c.rank} ${DEFS[c.type][0]}`, card: c })), optional); }
    findCard(p, id) { return this.cards(p).find(c => c.id === id); }
    async target(p, title, list = this.players.filter(x => x.alive && x !== p), optional = false) { let id = await this.ask(p, title, list.map(x => ({ value: x.id, label: `${playerName(x)} · ${x.hp}/${x.max} 体力` })), optional); return this.players.find(x => x.id === id); }
    check() {
        if (this.over) return this.over;
        if (this.mode === 'national') {
            const alive = this.alive();
            if (alive.length === 1) this.reveal(alive[0].id, 'both', false);
            const teams = new Set(alive.map(p => p.team));
            if (alive.length && !teams.has(null) && teams.size === 1) {
                this.winner = alive[0].team;
                this.resultTitle = this.winner.startsWith('wild:') ? `${playerName(alive[0])} · 野心家获胜` : `${teamName(this.winner)}获胜`;
                this.over = this.players[0].team === this.winner ? 'win' : 'lose';
            }
        } else if (this.mode === 'duel') {
            if (this.alive().length === 1) {
                this.winner = `duel:${this.alive()[0].id}`;
                this.over = this.players[0].alive ? 'win' : 'lose';
                this.resultTitle = `${playerName(this.alive()[0])}赢得单挑`;
            }
        } else if (!this.players[0].alive) {
            this.winner = this.alive().length === 1 && this.alive()[0].role === 'spy' ? 'spy' : 'rebel';
            this.over = 'lose';
        }
        else if (!this.players.some(p => p.alive && ['rebel', 'spy'].includes(p.role))) {
            this.winner = 'lord';
            this.over = 'win';
        }
        if (this.over) {
            this.phase = '结束';
            this.log(this.resultTitle || (this.over === 'win' ? '主忠获胜！反贼与内奸均已被击败。' : this.winner === 'spy' ? '内奸获胜，独步天下。' : '反贼获胜，主公已阵亡。'));
            this.hooks.sound?.(this.over === 'win' ? '大获全胜！' : '胜败乃兵家常事。');
        }
        return this.over;
    }
    async dying(p, source) {
        while (p.hp <= 0 && p.alive) {
            if (hasHero(p, 'zhoutai')) {
                const c = this.take();
                if (c) {
                    let repeated = p.scars.some(x => x.rank === c.rank);
                    p.scars.push(c);
                    this.skillVoice(p, '不屈');
                    this.log(`不屈：翻开${c.suit}${c.rank}${repeated ? '，点数重复' : '，继续战斗'}`);
                    if (!repeated)
                        return;
                }
            }
            let saved = false;
            for (const helper of this.alive()) {
                if (helper.id !== p.id && helper.id !== 0 && this.relation(helper, p) < .3)
                    continue;
                let ok = await this.respond(helper, 'tao', `${playerName(p)}濒死，是否使用桃救援？`);
                if (ok) {
                    p.hp++;
                    this.observe(helper, p, false);
                    this.motion('heal', { to: p.id, n: 1 });
                    saved = true;
                    if (p.hp > 0)
                        break;
                }
            }
            if (!saved) {
                if (this.mode === 'national') this.reveal(p.id, 'both', false);
                p.alive = false;
                this.log(`${playerName(p)}阵亡，${this.mode === 'national' ? teamName(p.team) : this.mode === 'duel' ? '单挑结束' : '身份为' + ({ lord: '主公', loyalist: '忠臣', rebel: '反贼', spy: '内奸' })[p.role]}`, { kind: 'death', actor: source?.id, target: p.id });
                await this.motion('death', { to: p.id });
                for (const c of this.cards(p))
                    this.discard.push(c);
                p.hand = [];
                p.equip = {};
                p.delays = [];
                if (this.mode === 'identity' && source?.alive && p.role === 'rebel') {
                    this.draw(source, 3);
                    this.log(`${playerName(source)}击败反贼，摸三张奖励牌`);
                }
                if (this.mode === 'identity' && source?.role === 'lord' && p.role === 'loyalist') {
                    for (const c of [...source.hand, ...Object.values(source.equip)])
                        this.discard.push(c);
                    source.hand = [];
                    source.equip = {};
                    this.log('主公误杀忠臣，弃置所有手牌与装备');
                }
                if (this.mode === 'national' && source?.alive && source !== p && source.team) {
                    if (source.team === p.team) {
                        this.discard.push(...source.hand, ...Object.values(source.equip));
                        source.hand = []; source.equip = {};
                        this.log(`${playerName(source)}误杀同势力，弃置所有手牌与装备`, { kind: 'info', actor: source.id });
                    } else {
                        this.draw(source, 2);
                        this.log(`${playerName(source)}击败敌对势力，摸两张奖励牌`, { kind: 'info', actor: source.id });
                    }
                }
                this.check();
                break;
            }
        }
    }
    async damage(target, n, source, card = null, redirect = false) {
        if (!target?.alive || this.over)
            return;
        if (hasHero(target, 'xiaoqiao') && !redirect) {
            const hearts = target.hand.filter(c => c.suit === '♥' || c.suit === '♠');
            let id = await this.pick(target, hearts, '天香：弃一张红桃牌转移伤害？', true);
            if (id != null) {
                let t = await this.target(target, '天香：选择承受伤害的角色');
                if (t) {
                    this.spend(target, this.findCard(target, id));
                    this.skillVoice(target, '天香');
                    await this.damage(t, n, source, card, true);
                    if (t.alive)
                        this.draw(t, Math.max(0, t.max - t.hp));
                    return;
                }
            }
        }
        this.observe(source, target, true);
        await this.gate();
        target.hp -= n;
        this.hooks.sound?.('受伤');
        this.log(`${playerName(source) || '判定'} → ${playerName(target)}：${n}点${card?.thunder ? '雷电' : ''}伤害，体力 ${target.hp}/${target.max}`, { kind: 'damage', actor: source?.id, target: target.id, amount: n });
        await this.motion('damage', { from: source?.id, to: target.id, n, thunder: card?.thunder });
        await this.dying(target, source);
        if (this.over)
            return;
        if (hasHero(source, 'weiyan') && source.alive && this.dist(source, target) <= 1) {
            if (source.hp < source.max) this.skillVoice(source, '狂骨');
            this.heal(source, n);
        }
        if (!target.alive)
            return;
        if (hasHero(target, 'caocao') && card?.id) {
            let ix = this.discard.findIndex(c => c.id === card.id);
            if (ix >= 0) {
                target.hand.push(this.discard.splice(ix, 1)[0]);
                this.skillVoice(target, '奸雄');
                this.log('奸雄：曹操获得伤害牌');
            }
        }
        if (hasHero(target, 'guojia')) {
            this.skillVoice(target, '遗计');
            this.draw(target, n * 2);
            this.log(`遗计：郭嘉摸${n * 2}张牌`);
            if (target.id === 0) {
                let chosen = await this.pick(target, target.hand, '遗计：可将一张手牌交给其他角色', true);
                if (chosen != null) {
                    let t = await this.target(target, '遗计：选择收牌角色');
                    let c = this.findCard(target, chosen);
                    if (t && c) {
                        this.remove(target, c);
                        t.hand.push(c);
                    }
                }
            }
        }
        if (hasHero(target, 'simayi') && source?.alive && this.cards(source).length) {
            this.skillVoice(target, '反馈');
            await this.transfer(target, source, true, '反馈');
        }
        if (hasHero(target, 'xiahoudun') && source?.alive) {
            let c = await this.judge(target, '刚烈');
            if (c && c.suit !== '♥') {
                let option = source.hand.length >= 2 ? await this.ask(source, '刚烈：弃两张手牌，或失去1点体力', [{ value: 'discard', label: '弃两张手牌' }, { value: 'hurt', label: '失去1点体力' }]) : 'hurt';
                if (option === 'discard') {
                    for (let i = 0; i < 2; i++) {
                        let id = await this.pick(source, source.hand, '刚烈：选择弃置的手牌');
                        if (id != null)
                            this.spend(source, this.findCard(source, id));
                    }
                }
                else {
                    source.hp--;
                    await this.dying(source, target);
                }
            }
        }
        this.emit();
    }
    async judge(p, reason) { let c = this.take(); if (!c)
        return null; this.skillVoice(p, reason); this.log(`${reason}判定：${c.suit}${c.rank}`); for (let actor of this.alive()) {
        let eligible = hasHero(actor, 'simayi') ? actor.hand : hasHero(actor, 'zhangjiao') ? this.cards(actor).filter(x => !suitRed(actor, x) && !actor.delays.includes(x)) : [];
        if (!eligible.length)
            continue;
        if (actor.id !== 0 && Math.random() > .3)
            continue;
        let id = await this.pick(actor, eligible, `${reason}：是否发动${hasHero(actor, 'simayi') ? '鬼才' : '鬼道'}改判？`, true);
        if (id != null) {
            let next = this.findCard(actor, id);
            this.skillVoice(actor, hasHero(actor, 'simayi') ? '鬼才' : '鬼道');
            this.remove(actor, next);
            if (hasHero(actor, 'zhangjiao'))
                actor.hand.push(c);
            else
                this.discard.push(c);
            c = next;
            this.log(`改判为${c.suit}${c.rank}`);
        }
    } let result = { ...c }; if (hasHero(p, 'xiaoqiao') && result.suit === '♠') {
        result.suit = '♥'; this.skillVoice(p, '红颜');
    } if (hasHero(p, 'guojia')) {
        p.hand.push(c); this.skillVoice(p, '天妒');
    } else
        this.discard.push(c); return result; }
    responseCards(p, type) { return p.hand.filter(c => c.type === type || (hasHero(p, 'zhaoyun') && ((type === 'sha' && c.type === 'shan') || (type === 'shan' && c.type === 'sha'))) || (hasHero(p, 'guanyu') && type === 'sha' && suitRed(p, c)) || (hasHero(p, 'zhenji') && type === 'shan' && !suitRed(p, c)) || (hasHero(p, 'huatuo') && type === 'tao' && this.turn !== p.id && suitRed(p, c))); }
    async respond(p, type, title, ignoreArmor = false) { if (!p.alive)
        return false; let cards = this.responseCards(p, type); let opts = cards.map(c => ({ value: c.id, label: `${c.suit}${c.rank} ${DEFS[c.type][0]}${c.type !== type ? ' → ' + DEFS[type][0] : ''}`, card: c }));
        if (p.generals) p.generals.forEach((hero, i) => {
            if (p.revealed[i]) return;
            const after = { ...p, revealed: p.revealed.map((v, index) => v || i === index) };
            if (this.responseCards(after, type).some(c => !cards.includes(c)) || hero.id === 'yuji' && p.hand.length)
                opts.push({ value: `reveal:${i}`, label: `亮出${hero.name}，使用技能响应` });
        });
        if (type === 'shan' && p.equip.armor?.type === 'bagua' && !ignoreArmor)
        opts.unshift({ value: 'bagua', label: '发动八卦阵 · 红色判定视为闪' }); if (hasHero(p, 'yuji') && p.hand.length)
        opts.push({ value: 'guhuo', label: `蛊惑：声明${DEFS[type][0]}` }); if (type === 'sha' && p.equip.weapon?.type === 'zhangba' && p.hand.length >= 2)
        opts.push({ value: 'zhangba', label: '丈八蛇矛：两张手牌当杀' }); let id = await this.ask(p, title, opts, true); if (id == null)
        return false;
        if (String(id).startsWith('reveal:')) {
            await this.gate();
            this.reveal(p.id, Number(id.split(':')[1]));
            await this.motion('skill', { from: p.id, to: p.id, name: '亮将' });
            return this.over ? false : this.respond(p, type, title, ignoreArmor);
        }
        if (id === 'bagua') {
        let c = await this.judge(p, '八卦阵');
        if (c && isRed(c)) {
            await this.afterDodge(p);
            return true;
        }
        return this.respond(p, type, title, true);
    } if (id === 'guhuo') {
        let chosen = await this.pick(p, p.hand, '蛊惑：选择扣置的手牌');
        if (chosen == null)
            return false;
        let c = this.findCard(p, chosen);
        let ok = await this.guhuo(p, c, type);
        if (ok && type === 'shan')
            await this.afterDodge(p);
        return ok;
    } if (id === 'zhangba') {
        for (let i = 0; i < 2; i++) {
            let chosen = await this.pick(p, p.hand, '丈八：选择手牌');
            this.spend(p, this.findCard(p, chosen));
        }
        return true;
    } let c = p.hand.find(x => x.id === id); if (!c)
        return false; this.spend(p, c); await this.show(p, c, type, null, 'response', title); if (type === 'shan')
        await this.afterDodge(p); return true; }
    async afterDodge(p) { if (!hasHero(p, 'zhangjiao') || this.over)
        return; let t = await this.target(p, '雷击：选择一名角色', this.enemies(p), true); if (t) {
        this.skillVoice(p, '雷击');
        let c = await this.judge(t, '雷击');
        if (c?.suit === '♠')
            await this.damage(t, 2, p, { thunder: true });
    } }
    async nullified(source, target, type) { let cancelled = false; for (let count = 0; count < 6; count++) {
        let found = false;
        for (let p of this.alive()) {
            let want = this.relation(p, target) > .2;
            if (['wuzhong', 'taoyuan', 'wugu'].includes(type))
                want = !want;
            if (cancelled)
                want = !want;
            if (p.id !== 0 && !want)
                continue;
            let ok = await this.respond(p, 'wuxie', `${DEFS[type][0]} → ${playerName(target)}：${cancelled ? '再次无懈可恢复效果' : '是否使用无懈可击？'}`);
            if (ok) {
                cancelled = !cancelled;
                found = true;
                break;
            }
        }
        if (!found)
            break;
    } if (cancelled)
        this.log(`无懈可击抵消了对${playerName(target)}的效果`); return cancelled; }
    async transfer(p, t, gain, title, includeDelays = true) { let cards = includeDelays ? this.cards(t) : [...t.hand, ...Object.values(t.equip)]; if (!cards.length)
        return; let visible = cards.map(c => ({ value: c.id, label: t.hand.includes(c) ? '随机手牌（不公开）' : `${DEFS[c.type][0]} · ${t.delays.includes(c) ? '判定区' : '装备区'}` })); let selected = await this.ask(p, `${title}：选择${playerName(t)}的一张牌`, visible); let c = cards.find(x => x.id === selected); if (c) {
        if (t.hand.includes(c))
            c = t.hand[Math.floor(Math.random() * t.hand.length)];
        this.remove(t, c);
        if (gain)
            p.hand.push(c);
        else
            this.discard.push(c);
        this.log(`${title}：${playerName(p)}${gain ? '获得' : '弃置'}了${playerName(t)}一张牌`);
    } }
    valid(p, c, t, type = c.type) { if (!p.alive)
        return '角色已阵亡'; if (['shan', 'wuxie'].includes(type))
        return '这张牌需要在响应时使用'; if (type === 'tao' && p.hp >= p.max)
        return '体力已满，无需使用桃'; if (type === 'sha' && p.used.tianyi === 'lose')
        return '天义拼点未赢，本回合不能使用杀'; if (type === 'sha' && p.used.sha >= (p.used.tianyi === 'win' ? 2 : 1) && !hasHero(p, 'zhangfei') && p.equip.weapon?.type !== 'zhuge')
        return '本回合已使用过杀'; if (['sha', 'juedou', 'guohe', 'shunshou', 'lebu'].includes(type)) {
        if (!t || t === p || !t.alive)
            return '请先选择一名有效目标';
        if (['sha', 'juedou'].includes(type) && hasHero(t, 'zhugeliang') && !t.hand.length)
            return '空城：不能选择没有手牌的诸葛亮';
        if (['shunshou', 'lebu'].includes(type) && hasHero(t, 'luxun'))
            return '谦逊：陆逊不能成为此牌目标';
        if (type === 'sha' && p.used.tianyi !== 'win' && this.dist(p, t) > this.range(p))
            return '目标超出攻击范围';
        if (type === 'shunshou' && !hasHero(p, 'huangyueying') && this.dist(p, t) > 1)
            return '顺手牵羊需要距离1以内';
        if (['guohe', 'shunshou'].includes(type) && !this.cards(t).length)
            return '目标没有可操作的牌';
        if (type === 'lebu' && t.delays.some(c => c.type === 'lebu'))
            return '目标已有乐不思蜀';
    } if (type === 'shandian' && p.delays.some(c => c.type === 'shandian'))
        return '你已有闪电'; return null; }
    async guhuo(p, c, type) { this.skillVoice(p, '蛊惑'); this.remove(p, c); this.discard.push(c); this.log(`${playerName(p)}蛊惑，声明【${DEFS[type][0]}】`); let questioned = []; for (let t of this.players.filter(x => x.alive && x !== p)) {
        let q = t.id === 0 ? await this.ask(t, `于吉声明${DEFS[type][0]}，是否质疑？`, [{ value: true, label: '质疑' }, { value: false, label: '不质疑' }]) : Math.random() < .45;
        if (q)
            questioned.push(t);
    } if (!questioned.length) {
        await this.show(p, c, type);
        return true;
    } let truth = c.type === type; this.log(`蛊惑揭示：${c.suit}${c.rank} ${DEFS[c.type][0]}，${truth ? '真牌' : '假牌'}`); for (let t of questioned) {
        if (truth) {
            t.hp--;
            await this.dying(t, p);
        }
        else
            this.draw(t, 1);
    } let valid = truth && c.suit === '♥'; if (!valid)
        this.log('蛊惑被识破，此牌无效'); return valid; }
    async play(pid, cardId, targetId = null, asType = null) { let p = this.players[pid], c = p.hand.find(c => c.id === cardId), t = this.players[targetId]; if (!c || this.over)
        return false; let type = asType || c.type; if (!this.conversions(p, c).includes(type)) return false; let error = this.valid(p, c, t, type); if (error) {
        if (pid === 0)
            this.log(error);
        return false;
    } this.resolving.add(c.id);
    try {
    if (asType && hasHero(p, 'yuji')) {
        if (!await this.guhuo(p, c, type))
            return true;
    }
    else {
        this.spend(p, c);
        await this.show(p, c, type, ['sha', 'juedou', 'guohe', 'shunshou', 'lebu'].includes(type) ? t : null);
    } if (hasHero(p, 'huangyueying') && DEFS[type][1] === '锦囊') {
        this.skillVoice(p, '集智'); this.draw(p, 1);
    } await this.effect(p, c, t, type); this.emit(); return true;
    } finally { this.resolving.delete(c.id); }
    }
    async effect(p, c, t, type) {
        if (this.over)
            return;
        if (t && ['sha', 'juedou', 'guohe', 'shunshou', 'lebu'].includes(type))
            this.observe(p, t, true);
        let eq = slot({ type });
        if (eq) {
            let old = p.equip[eq];
            if (old)
                this.spend(p, old);
            let i = this.discard.findIndex(x => x.id === c.id);
            if (i >= 0)
                this.discard.splice(i, 1);
            await this.gate();
            p.equip[eq] = { ...c, type };
            this.log(`${playerName(p)}装备【${DEFS[type][0]}】${old ? `，替换${DEFS[old.type][0]}` : ''}`, { kind: 'equip', actor: p.id, target: p.id, card: { ...c, type } });
            await this.motion('equip', { to: p.id, card: { ...c, type } });
            return;
        }
        if (type === 'sha') {
            if (p.used.sha >= 1) this.skillVoice(p, '咆哮');
            p.used.sha = (p.used.sha || 0) + 1;
            let targets = [t];
            if (p.used.tianyi === 'win') {
                const extra = await this.target(p, '天义：可以追加一个杀的目标', (p.id === 0 ? this.alive() : this.enemies(p)).filter(x => x !== p && x !== t && !(hasHero(x, 'zhugeliang') && !x.hand.length)), true);
                if (extra) targets.push(extra);
            }
            if (p.equip.weapon?.type === 'fangtian' && !p.hand.length) {
                let extras = this.players.filter(x => x.alive && x !== p && x !== t && this.dist(p, x) <= this.range(p) && !(hasHero(x, 'zhugeliang') && !x.hand.length));
                if (extras.length) {
                    let more = await this.ask(p, '方天画戟：追加攻击另一名角色？', [{ value: true, label: '追加目标' }], true);
                    if (more)
                        targets.push(...extras.filter(x => !targets.includes(x)).slice(0, Math.max(0, 3 - targets.length)));
                }
            }
            for (let x of targets)
                await this.attack(p, x, c);
            return;
        }
        if (type === 'tao') {
            this.heal(p);
            return;
        }
        if (['lebu', 'shandian'].includes(type)) {
            let x = type === 'lebu' ? t : p;
            if (await this.nullified(p, x, type))
                return;
            let i = this.discard.findIndex(x => x.id === c.id);
            if (i >= 0)
                this.discard.splice(i, 1);
            x.delays.push({ ...c, type });
            return;
        }
        if (type === 'wuzhong') {
            if (!await this.nullified(p, p, type))
                this.draw(p, 2);
            return;
        }
        if (['guohe', 'shunshou'].includes(type)) {
            if (type === 'shunshou' && this.dist(p, t) > 1) this.skillVoice(p, '奇才');
            await this.motion('trick', { from: p.id, to: t.id, card: { ...c, type } });
            if (!await this.nullified(p, t, type))
                await this.transfer(p, t, type === 'shunshou', DEFS[type][0]);
            return;
        }
        if (type === 'juedou') {
            await this.motion('trick', { from: p.id, to: t.id, card: { ...c, type } });
            if (!await this.nullified(p, t, type))
                await this.duel(p, t, c);
            return;
        }
        if (type === 'wugu') {
            let pool = [];
            for (let i = 0; i < this.alive().length; i++) {
                let x = this.take();
                if (x)
                    pool.push(x);
            }
            for (let x of this.order(p.id)) {
                if (!pool.length || await this.nullified(p, x, type))
                    continue;
                let id = await this.pick(x, pool, '五谷丰登：选择一张牌');
                let ix = pool.findIndex(c => c.id === id);
                if (ix >= 0)
                    x.hand.push(pool.splice(ix, 1)[0]);
            }
            this.discard.push(...pool);
            return;
        }
        for (let x of this.order(p.id)) {
            if (this.over)
                break;
            if (!x.alive)
                continue;
            if (['nanman', 'wanjian'].includes(type) && x === p)
                continue;
            if (type === 'nanman' && ['menghuo', 'zhurong'].some(id => hasHero(x, id))) {
                this.skillVoice(x, hasHero(x, 'menghuo') ? '祸首' : '巨象');
                this.log(`${playerName(x)}：${hasHero(x, 'menghuo') ? '祸首' : '巨象'}，南蛮入侵无效`, { kind: 'skill', actor: x.id });
                continue;
            }
            if (await this.nullified(p, x, type))
                continue;
            if (type === 'taoyuan')
                this.heal(x);
            else if (['nanman', 'wanjian'].includes(type)) {
                await this.gate();
                this.log(`${playerName(p)}的【${DEFS[type][0]}】 → ${playerName(x)}：等待响应`, { kind: 'effect', actor: p.id, target: x.id });
                await this.motion('trick', { from: p.id, to: x.id, card: { ...c, type } });
                let need = type === 'nanman' ? 'sha' : 'shan';
                if (!await this.respond(x, need, `${DEFS[type][0]}：请打出一张${DEFS[need][0]}，否则受到1点伤害`))
                    await this.damage(x, 1, type === 'nanman' ? this.alive().find(a => hasHero(a, 'menghuo')) || p : p, c);
            }
        }
        if (type === 'nanman') {
            const owner = this.alive().find(x => hasHero(x, 'zhurong') && x !== p);
            const index = this.discard.findIndex(x => x.id === c.id);
            if (owner && index >= 0) {
                owner.hand.push(this.discard.splice(index, 1)[0]);
                await this.announce(owner, '巨象');
                this.log('巨象：祝融获得结算后的南蛮入侵', { kind: 'skill', actor: owner.id });
            }
        }
    }
    order(start) { return [...this.players.slice(start), ...this.players.slice(0, start)].filter(x => x.alive); }
    async duel(a, b, c) { this.skillVoice(a, '无双'); this.skillVoice(b, '无双'); let current = b, other = a; for (let i = 0; i < 120 && !this.over && current.alive && other.alive; i++) {
        let count = hasHero(other, 'lvbu') ? 2 : 1, ok = true;
        for (let j = 0; j < count; j++) {
            if (!await this.respond(current, 'sha', `决斗：响应${playerName(other)}，打出杀（${j + 1}/${count}）`)) {
                ok = false;
                break;
            }
        }
        if (!ok) {
            await this.damage(current, 1 + (other.used.luoyi ? 1 : 0), other, c);
            break;
        }
        [current, other] = [other, current];
    } }
    async attack(p, t, c, force = false) {
        if (!t?.alive || this.over)
            return;
        await this.motion('attack', { from: p.id, to: t.id, card: c });
        if (hasHero(t, 'daqiao') && t.hand.length) {
            let alternatives = this.players.filter(x => x.alive && x !== p && x !== t && this.dist(t, x) <= this.range(t));
            if (alternatives.length) {
                let id = await this.pick(t, this.cards(t).filter(x => !t.delays.includes(x)), '流离：弃一张牌转移杀？', true);
                if (id != null) {
                    let next = await this.target(t, '流离：选择新目标', alternatives);
                    if (next) {
                        this.spend(t, this.findCard(t, id));
                        this.skillVoice(t, '流离');
                        t = next;
                    }
                }
            }
        }
        const weapon = p.equip.weapon?.type, ignore = weapon === 'qinggang';
        if (t.equip.armor?.type === 'renwang' && !suitRed(p, c) && !ignore) {
            this.log('仁王盾：黑色杀无效');
            return;
        }
        if (weapon === 'cixiong' && playerFemale(p) !== null && playerFemale(t) !== null && playerFemale(p) !== playerFemale(t)) {
            let id = await this.pick(t, t.hand, '雌雄双股剑：弃一张手牌，否则对方摸牌', true);
            if (id == null)
                this.draw(p, 1);
            else
                this.spend(t, this.findCard(t, id));
        }
        if (hasHero(p, 'machao')) {
            let judge = await this.judge(p, '铁骑');
            if (judge && isRed(judge))
                force = true;
        }
        if (hasHero(p, 'huangzhong') && this.turn === p.id && (t.hand.length >= p.hp || t.hand.length <= this.range(p))) {
            force = true;
            this.skillVoice(p, '烈弓');
            this.log('烈弓：此杀不可闪避');
        }
        this.skillVoice(p, '无双');
        if (this.dist(p, t) + 1 > this.range(p)) this.skillVoice(p, '马术');
        let count = hasHero(p, 'lvbu') ? 2 : 1, dodged = !force;
        for (let j = 0; j < count && !force; j++) {
            if (!await this.respond(t, 'shan', `${playerName(p)}对你使用杀，请打出闪（${j + 1}/${count}）`, ignore)) {
                dodged = false;
                break;
            }
        }
        if (this.over || !t.alive || !p.alive)
            return;
        if (dodged && weapon === 'guanshi' && this.cards(p).filter(x => x !== p.equip.weapon && !p.delays.includes(x)).length >= 2) {
            let yes = await this.ask(p, '贯石斧：弃两张牌令杀命中？', [{ value: true, label: '发动贯石斧' }], true);
            if (yes) {
                for (let i = 0; i < 2; i++) {
                    let cs = this.cards(p).filter(x => x !== p.equip.weapon && !p.delays.includes(x));
                    let id = await this.pick(p, cs, '贯石斧：选择弃牌');
                    this.spend(p, this.findCard(p, id));
                }
                dodged = false;
            }
        }
        if (dodged) {
            await this.motion('dodge', { to: t.id });
            this.log(`${playerName(t)}闪避了${playerName(p)}的杀`, { kind: 'response', actor: t.id, target: p.id });
            if (hasHero(p, 'pangde') && (t.hand.length || Object.values(t.equip).length)) {
                const yes = await this.ask(p, '猛进：弃置目标一张手牌或装备？', [{ value: true, label: '发动猛进' }], true);
                if (yes) {
                    await this.announce(p, '猛进', t);
                    await this.transfer(p, t, false, '猛进', false);
                }
            }
            if (weapon === 'qinglong') {
                let next = await this.pick(p, this.responseCards(p, 'sha'), '青龙偃月刀：追加一张杀？', true);
                if (next != null) {
                    let nc = this.findCard(p, next);
                    this.spend(p, nc);
                    await this.show(p, nc, 'sha', t);
                    await this.attack(p, t, nc);
                }
            }
            return;
        }
        if (weapon === 'hanbing' && this.cards(t).length) {
            let yes = await this.ask(p, '寒冰剑：以弃目标两张牌代替伤害？', [{ value: true, label: '弃置目标两张牌' }], true);
            if (yes) {
                for (let i = 0; i < 2; i++)
                    await this.transfer(p, t, false, '寒冰剑');
                return;
            }
        }
        await this.damage(t, 1 + (p.used.luoyi ? 1 : 0), p, c);
        if (!this.over && p.alive && t.alive && hasHero(p, 'zhurong') && p.hand.length && t.hand.length) {
            const yes = await this.ask(p, '烈刃：与目标拼点，赢则获得其一张牌？', [{ value: true, label: '发动烈刃' }], true);
            if (yes && await this.pindian(p, t, '烈刃')) await this.transfer(p, t, true, '烈刃', false);
        }
        if (t.alive && weapon === 'qilin' && (t.equip.horse || t.equip.offhorse)) {
            let horses = [t.equip.horse, t.equip.offhorse].filter(Boolean);
            let id = await this.pick(p, horses, '麒麟弓：弃置目标一匹马？', true);
            if (id != null)
                this.spend(t, horses.find(x => x.id === id));
        }
    }
    async begin(pid) {
        if (this.over)
            return false;
        await this.gate();
        this.turn = pid;
        let p = this.players[pid];
        if (!p.alive)
            return false;
        p.used = { sha: 0 };
        this.phase = '准备';
        this.log(`第${this.round}轮 · ${playerName(p)}的回合`, { kind: 'turn', actor: p.id });
        await this.motion('turn', { to: p.id, name: playerName(p) });
        if (p.flipped) {
            p.flipped = false;
            this.log(`${playerName(p)}翻回正面，跳过本回合`);
            return false;
        }
        if (this.mode === 'national' && p.revealed.some(v => !v)) {
            const choices = [{ value: 'both', label: '亮出全部武将' }, ...p.generals.flatMap((h, i) => p.revealed[i] ? [] : [{ value: i, label: `只亮${i ? '副' : '主'}将 · ${h.name}` }])];
            const choice = await this.ask(p, '准备阶段：是否亮将？未亮出的武将技能不会生效', choices, true);
            if (choice != null) { this.reveal(pid, choice); await this.motion('skill', { from: pid, to: pid, name: '亮将' }); }
            if (this.over) return false;
        }
        if (hasHero(p, 'xiahouyuan')) {
            let yes = await this.ask(p, '神速：跳过判定与摸牌，视为出杀？', [{ value: true, label: '发动神速' }], true);
            if (yes) {
                let t = await this.target(p, '神速：选择目标', this.enemies(p));
                if (t) {
                    this.skillVoice(p, '神速');
                    await this.attack(p, t, { type: 'sha', suit: '', rank: '' });
                }
                this.phase = '出牌';
                return !this.over;
            }
        }
        if (hasHero(p, 'zhugeliang')) {
            this.skillVoice(p, '观星');
            let top = [];
            for (let i = 0; i < Math.min(5, this.alive().length); i++) {
                let c = this.take();
                if (c)
                    top.push(c);
            }
            let sorted = [];
            while (top.length) {
                let id = await this.pick(p, top, '观星：依次选择牌堆顶顺序（最先摸到的先选）');
                let index = top.findIndex(x => x.id === id);
                if (index < 0)
                    index = 0;
                sorted.push(top.splice(index, 1)[0]);
            }
            this.pile.push(...sorted.reverse());
            this.log('观星：已整理牌堆顶');
        }
        if (hasHero(p, 'zhenji')) {
            for (let i = 0; i < 30; i++) {
                let yes = await this.ask(p, '洛神：是否继续判定？', [{ value: true, label: '发动洛神' }], true);
                if (!yes)
                    break;
                let c = await this.judge(p, '洛神');
                if (!c || isRed(c))
                    break;
                let ix = this.discard.findIndex(x => x.id === c.id);
                if (ix >= 0)
                    p.hand.push(this.discard.splice(ix, 1)[0]);
            }
        }
        let skip = false;
        this.phase = '判定';
        for (let c of [...p.delays].reverse()) {
            p.delays = p.delays.filter(x => x.id !== c.id);
            this.discard.push(c);
            if (await this.nullified(p, p, c.type))
                continue;
            let j = await this.judge(p, DEFS[c.type][0]);
            if (c.type === 'lebu' && j?.suit !== '♥') {
                skip = true;
                this.log(`${playerName(p)}乐不思蜀，跳过出牌阶段`);
            }
            if (c.type === 'shandian') {
                if (j?.suit === '♠' && Number(j.rank) >= 2 && Number(j.rank) <= 9)
                    await this.damage(p, 3, null, { ...c, thunder: true });
                else {
                    let next = this.order(pid).slice(1).find(x => !x.delays.some(c => c.type === 'shandian'));
                    if (next) {
                        this.discard = this.discard.filter(x => x.id !== c.id);
                        next.delays.push(c);
                        this.log(`闪电传递给${playerName(next)}`);
                    }
                }
            }
            if (!p.alive || this.over)
                return false;
        }
        this.phase = '摸牌';
        let n = hasHero(p, 'zhouyu') ? 3 : 2;
        if (hasHero(p, 'menghuo') && p.hp < p.max) {
            const yes = await this.ask(p, '再起：用展示牌代替摸牌？红桃回血，其余收入手牌', [{ value: true, label: '发动再起' }], true);
            if (yes) {
                await this.announce(p, '再起');
                const lost = p.max - p.hp;
                for (let i = 0; i < lost; i++) {
                    const c = this.take();
                    if (!c) break;
                    this.log(`再起：展示${c.suit}${c.rank}【${DEFS[c.type][0]}】`, { kind: 'skill', actor: p.id, card: c });
                    if (c.suit === '♥') { this.discard.push(c); this.heal(p); }
                    else p.hand.push(c);
                }
                n = 0;
            }
        }
        if (hasHero(p, 'zhangliao') && this.enemies(p).some(x => x.hand.length)) {
            let yes = await this.ask(p, '突袭：改为从对手各获得一张手牌？', [{ value: true, label: '发动突袭' }], true);
            if (yes) {
                this.skillVoice(p, '突袭');
                for (let t of this.players.filter(x => x.alive && x !== p && x.hand.length).slice(0, 2)) {
                    let c = t.hand[Math.floor(Math.random() * t.hand.length)];
                    this.remove(t, c);
                    p.hand.push(c);
                }
                n = 0;
            }
        }
        if (hasHero(p, 'xuchu')) {
            let yes = await this.ask(p, '裸衣：少摸一张，本回合杀和决斗伤害+1？', [{ value: true, label: '发动裸衣' }], true);
            if (yes) {
                n--;
                this.skillVoice(p, '裸衣');
                p.used.luoyi = true;
            }
        }
        if (n > 0) this.skillVoice(p, '英姿');
        this.draw(p, n);
        this.phase = skip ? '弃牌' : '出牌';
        this.emit();
        return !skip && !this.over;
    }
    conversions(p, c) { let options = [c.type]; if (hasHero(p, 'guanyu') && suitRed(p, c))
        options.push('sha'); if (hasHero(p, 'zhaoyun') && c.type === 'shan')
        options.push('sha'); if (hasHero(p, 'ganning') && !suitRed(p, c))
        options.push('guohe'); if (hasHero(p, 'daqiao') && c.suit === '♦')
        options.push('lebu'); if (hasHero(p, 'yuji'))
        options.push('sha', 'tao', 'wuzhong', 'guohe', 'shunshou', 'juedou', 'nanman', 'wanjian', 'taoyuan', 'wugu'); return [...new Set(options)]; }
    skills(p) { let list = [];
        if (p.generals) p.generals.forEach((h, i) => { if (!p.revealed[i]) list.push([`reveal:${i}`, `亮${i ? '副' : '主'}将 · ${h.name}`]); });
        if (hasHero(p, 'dianwei') && !p.used.qiangxi) list.push(['qiangxi', '强袭']);
        if (hasHero(p, 'taishici') && !p.used.tianyi && p.hand.length) list.push(['tianyi', '天义']);
        if (hasHero(p, 'yuanshao') && p.hand.some(c => p.hand.some(d => c !== d && c.suit === d.suit))) list.push(['luanji', '乱击']); if (hasHero(p, 'liubei'))
        list.push(['rende', '仁德']); if (hasHero(p, 'sunquan') && !p.used.zhiheng)
        list.push(['zhiheng', '制衡']); if (hasHero(p, 'huanggai'))
        list.push(['kurou', '苦肉']); if (hasHero(p, 'huatuo') && !p.used.qingnang)
        list.push(['qingnang', '青囊']); if (hasHero(p, 'sunshangxiang') && !p.used.jieyin)
        list.push(['jieyin', '结姻']); if (hasHero(p, 'diaochan') && !p.used.lijian)
        list.push(['lijian', '离间']); if (hasHero(p, 'zhouyu') && !p.used.fanjian)
        list.push(['fanjian', '反间']); if (hasHero(p, 'xiahouyuan'))
        list.push(['shensu', '神速']); if (p.equip.weapon?.type === 'zhangba')
        list.push(['zhangba', '丈八蛇矛']); return list; }
    async pindian(p, t, name) {
        if (!p.hand.length || !t.hand.length) return false;
        const points = c => ({ A: 1, J: 11, Q: 12, K: 13 })[c.rank] || Number(c.rank);
        const choose = actor => actor.id === 0 ? this.pick(actor, actor.hand, `${name}：选择一张手牌拼点`) : Promise.resolve([...actor.hand].sort((a, b) => points(b) - points(a))[0].id);
        const a = this.findCard(p, await choose(p));
        const b = this.findCard(t, await choose(t));
        if (!a || !b) return false;
        this.spend(p, a); this.spend(t, b);
        await this.announce(p, name, t);
        const win = points(a) > points(b);
        this.log(`${name}拼点：${playerName(p)} ${a.suit}${a.rank} / ${playerName(t)} ${b.suit}${b.rank}，${win ? playerName(p) + '获胜' : '未赢'}`, { kind: 'skill', actor: p.id, target: t.id });
        return win;
    }
    async expansionSkill(p, key) {
        if (key === 'tianyi') {
            const t = await this.target(p, '天义：选择有手牌的拼点目标', (p.id === 0 ? this.alive().filter(x => x !== p) : this.enemies(p)).filter(x => x.hand.length), true);
            if (!t) return false;
            p.used.tianyi = await this.pindian(p, t, '天义') ? 'win' : 'lose';
            this.emit();
            return true;
        }
        if (key === 'qiangxi') {
            const weapons = [...p.hand, ...Object.values(p.equip)].filter(c => slot(c) === 'weapon');
            const cost = await this.ask(p, '强袭：选择代价', [...weapons.map(c => ({ value: c.id, label: `弃置${DEFS[c.type][0]}`, card: c })), { value: 'hp', label: '失去1点体力' }], true);
            if (cost == null) return false;
            const weapon = weapons.find(c => c.id === cost);
            const reach = weapon === p.equip.weapon ? 1 : this.range(p);
            const t = await this.target(p, '强袭：选择攻击范围内的目标', (p.id === 0 ? this.alive().filter(x => x !== p) : this.enemies(p)).filter(x => this.dist(p, x) <= reach), true);
            if (!t) return false;
            p.used.qiangxi = true;
            await this.announce(p, '强袭', t);
            if (weapon) this.spend(p, weapon);
            else { p.hp--; this.log(`${playerName(p)}为强袭失去1点体力`, { kind: 'damage', target: p.id }); await this.dying(p, null); }
            if (p.alive && !this.over) await this.damage(t, 1, p);
            return true;
        }
        const first = await this.pick(p, p.hand.filter(c => p.hand.some(d => c !== d && c.suit === d.suit)), '乱击：选择第一张同花色手牌', true);
        if (first == null) return false;
        const a = this.findCard(p, first);
        const second = await this.pick(p, p.hand.filter(c => c !== a && c.suit === a.suit), '乱击：选择第二张同花色手牌', true);
        if (second == null) return false;
        const b = this.findCard(p, second);
        this.spend(p, a); this.spend(p, b);
        await this.announce(p, '乱击');
        const virtual = { type: 'wanjian', suit: a.suit, rank: '' };
        await this.show(p, virtual);
        await this.effect(p, virtual, null, 'wanjian');
        return true;
    }
    async skill(pid, key) {
        let p = this.players[pid];
        if (!p?.alive || !this.skills(p).some(x => x[0] === key) || this.over)
            return false;
        if (key.startsWith('reveal:')) {
            await this.gate();
            const revealed = this.reveal(pid, Number(key.split(':')[1]));
            await this.motion('skill', { from: pid, to: pid, name: '亮将' });
            return revealed;
        }
        if (['qiangxi', 'tianyi', 'luanji'].includes(key)) return this.expansionSkill(p, key);
        if (key === 'kurou') {
            await this.announce(p, '苦肉');
            p.hp--;
            this.log('苦肉：失去1点体力');
            await this.dying(p, null);
            if (p.alive)
                this.draw(p, 2);
            return true;
        }
        if (key === 'zhiheng') {
            let pool = this.cards(p).filter(c => !p.delays.includes(c)), selected = [];
            while (pool.length) {
                let id = await this.pick(p, pool, `制衡：已选${selected.length}张，取消即确认换牌`, true);
                if (id == null)
                    break;
                let c = pool.find(x => x.id === id);
                selected.push(c);
                pool = pool.filter(x => x !== c);
                if (pid !== 0 && selected.length >= 2)
                    break;
            }
            if (!selected.length)
                return false;
            await this.announce(p, '制衡');
            for (let c of selected)
                this.spend(p, c);
            this.draw(p, selected.length);
            p.used.zhiheng = true;
            return true;
        }
        if (['jieyin', 'zhangba'].includes(key) && p.hand.length < 2) {
            this.log('需要至少两张手牌');
            return false;
        }
        if (!p.hand.length && key !== 'shensu') {
            this.log('没有可用的手牌');
            return false;
        }
        let t;
        if (key === 'rende')
            t = await this.target(p, '仁德：选择收牌角色');
        if (key === 'qingnang')
            t = await this.target(p, '青囊：选择受伤角色', this.alive().filter(x => x.hp < x.max), true);
        if (key === 'jieyin')
            t = await this.target(p, '结姻：选择受伤男性', this.alive().filter(x => x !== p && playerFemale(x) === false && x.hp < x.max), true);
        if (key === 'fanjian')
            t = await this.target(p, '反间：选择目标', this.enemies(p));
        if (['zhangba', 'shensu'].includes(key))
            t = await this.target(p, '选择杀的目标', this.enemies(p).filter(x => key === 'shensu' || this.dist(p, x) <= this.range(p)), true);
        if (key === 'lijian') {
            let men = this.alive().filter(x => playerFemale(x) === false && x !== p);
            if (men.length < 2) {
                this.log('离间需要另外两名存活男性');
                return false;
            }
            t = await this.target(p, '离间：选择先打出杀的男性', men);
            let other = men.find(x => x !== t);
            let id = await this.pick(p, this.cards(p).filter(x => !p.delays.includes(x)), '离间：弃一张牌', true);
            if (id == null)
                return false;
            this.spend(p, this.findCard(p, id));
            p.used.lijian = true;
            await this.announce(p, '离间', t);
            await this.duel(other, t, { type: 'juedou' });
            return true;
        }
        if (!t)
            return false;
        if (key === 'fanjian') {
            await this.announce(p, '反间', t);
            let suit = await this.ask(t, '反间：猜测将获得的牌的花色', ['♠', '♥', '♣', '♦'].map(x => ({ value: x, label: x })));
            let c = p.hand[Math.floor(Math.random() * p.hand.length)];
            this.remove(p, c);
            t.hand.push(c);
            p.used.fanjian = true;
            this.log(`反间：${playerName(t)}猜${suit}，获得${c.suit}${c.rank}`);
            if (suit !== c.suit)
                await this.damage(t, 1, p);
            return true;
        }
        let pool = key === 'shensu' ? this.cards(p).filter(c => slot(c) && !p.delays.includes(c)) : p.hand;
        let id = await this.pick(p, pool, `${key === 'shensu' ? '神速：弃装备牌' : '选择一张手牌'}`, true);
        if (id == null)
            return false;
        let c = this.findCard(p, id);
        if (key === 'rende') {
            await this.announce(p, '仁德', t);
            this.remove(p, c);
            t.hand.push(c);
            this.observe(p, t, false);
            p.used.rende = (p.used.rende || 0) + 1;
            if (p.used.rende === 2)
                this.heal(p);
            return true;
        }
        if (key === 'zhangba' && (p.used.tianyi === 'lose' || (p.used.sha >= (p.used.tianyi === 'win' ? 2 : 1) && !hasHero(p, 'zhangfei')))) {
            this.log('本回合已使用杀');
            return false;
        }
        this.spend(p, c);
        if (['jieyin', 'zhangba'].includes(key)) {
            let id2 = await this.pick(p, p.hand, '选择第二张手牌');
            if (id2 == null)
                return false;
            this.spend(p, this.findCard(p, id2));
        }
        p.used[key] = true;
        await this.announce(p, ({ qingnang: '青囊', jieyin: '结姻', shensu: '神速', zhangba: '丈八蛇矛' })[key] || key, t);
        if (key === 'qingnang')
            this.heal(t);
        if (key === 'jieyin') {
            this.heal(p);
            this.heal(t);
        }
        if (['shensu', 'zhangba'].includes(key)) {
            if (key === 'zhangba')
                p.used.sha = (p.used.sha || 0) + 1;
            await this.attack(p, t, { type: 'sha', suit: '', rank: '' });
            if (key === 'shensu')
                this.phase = '弃牌';
        }
        this.emit();
        return true;
    }
    async finish(pid) {
        let p = this.players[pid];
        if (!p.alive || this.over)
            return;
        this.phase = '弃牌';
        if (hasHero(p, 'lvmeng') && !p.used.sha && p.hand.length > Math.max(0, p.hp)) this.skillVoice(p, '克己');
        if (!(hasHero(p, 'lvmeng') && !p.used.sha)) {
            while (p.hand.length > Math.max(0, p.hp)) {
                let cards = [...p.hand];
                if (pid !== 0)
                    cards.sort((a, b) => this.value(a) - this.value(b));
                let id = await this.pick(p, cards, `弃牌阶段：请弃${p.hand.length - Math.max(0, p.hp)}张牌（手牌上限${Math.max(0, p.hp)}）`);
                if (id == null)
                    id = cards[0].id;
                this.spend(p, this.findCard(p, id));
            }
        }
        this.phase = '结束';
        if (hasHero(p, 'diaochan')) {
            this.skillVoice(p, '闭月');
            this.draw(p, 1);
        }
        if (hasHero(p, 'caoren')) {
            let yes = await this.ask(p, '据守：摸三张牌并翻面，跳过下回合？', [{ value: true, label: '发动据守' }], true);
            if (yes) {
                this.draw(p, 3);
                p.flipped = true;
                this.skillVoice(p, '据守');
                this.log('据守：摸三张牌并翻面');
            }
        }
        this.emit();
    }
    value(c) { return ({ tao: 10, shan: 8, wuxie: 7, sha: 6, wuzhong: 9 })[c.type] || 3; }
    async ai(pid) { let p = this.players[pid]; if (!p.alive || this.over)
        return; if (hasHero(p, 'taishici') && !p.used.tianyi && p.hand.length && this.enemies(p).some(x => x.hand.length)) await this.skill(pid, 'tianyi'); for (let count = 0; count < 22 && !this.over && p.alive; count++) {
        let done = false;
        let sorted = [...p.hand].sort((a, b) => (slot(b) ? 20 : b.type === 'tao' ? 19 : b.type === 'wuzhong' ? 18 : 0) - (slot(a) ? 20 : a.type === 'tao' ? 19 : a.type === 'wuzhong' ? 18 : 0));
        for (let c of sorted) {
            let types = this.conversions(p, c);
            if (hasHero(p, 'yuji'))
                types = [c.type];
            for (let type of types) {
                if (['shan', 'wuxie', 'shandian'].includes(type))
                    continue;
                if (type === 'taoyuan' && p.hp >= p.max)
                    continue;
                if (['nanman', 'wanjian'].includes(type) && this.alive().reduce((v, t) => v + (t !== p ? this.relation(p, t) : 0), 0) > .4)
                    continue;
                let targets = this.enemies(p);
                let target = targets.find(t => !this.valid(p, c, t, type));
                if (!target && ['sha', 'juedou', 'guohe', 'shunshou', 'lebu'].includes(type))
                    continue;
                if (this.valid(p, c, target, type))
                    continue;
                if (slot({ type }) && p.equip[slot({ type })]?.type === type)
                    continue;
                await this.pause();
                done = await this.play(pid, c.id, target?.id, type === c.type ? null : type);
                if (done)
                    break;
            }
            if (done)
                break;
        }
        if (!done) {
            let key = this.skills(p).map(x => x[0]).find(k => (k === 'qiangxi' && p.hp > 1 && this.enemies(p).some(t => this.dist(p, t) <= this.range(p))) || (k === 'tianyi' && this.enemies(p).some(t => t.hand.length)) || (k === 'luanji' && this.enemies(p).length >= 2) || (k === 'qingnang' && p.hp < p.max) || (k === 'kurou' && p.hp >= 3 && !p.used.aiKurou) || (k === 'fanjian' && p.hand.length) || (k === 'zhiheng' && p.hand.length > 1) || (k === 'jieyin' && p.hand.length >= 2 && this.alive().some(x => x !== p && playerFemale(x) === false && x.hp < x.max)) || (k === 'lijian' && p.hand.length && this.alive().filter(x => x !== p && playerFemale(x) === false).length >= 2));
            if (key) {
                p.used.aiKurou = true;
                done = await this.skill(pid, key);
            }
        }
        if (!done)
            break;
        this.emit();
    } }
}
