'use client';
import { useRef, useState } from 'react';
import { Swords, Shield, Wind, ScrollText, X, ChevronDown, Timer, ArrowRight, Layers, Sparkles, Heart, Target } from 'lucide-react';
import { DEFS } from '@/lib/game/data';

import { playerName } from '@/lib/game/players';

const EQUIPMENT = [
    ['weapon', '武器', Swords], ['armor', '防具', Shield],
    ['offhorse', '进攻马', Wind], ['horse', '防御马', Wind],
];
export function Equipment({ player, onInspect, recent, compact = false }) {
    return <div className={`equipment-rack ${compact ? 'compact' : ''}`} aria-label={`${playerName(player)}的装备`}>
        {EQUIPMENT.map(([key, label, Icon]) => {
            const c = player.equip[key];
            return <button key={key} className={`equipment-slot slot-${key} ${c ? 'occupied' : ''} ${c && recent === c.id ? 'new-equipment' : ''}`} disabled={!c}
                onClick={() => c && onInspect(c)} title={c ? `${DEFS[c.type][0]}：${DEFS[c.type][2]}` : `${label} · 未装备`}>
                <Icon size={15}/><span><small>{label}</small><b>{c ? DEFS[c.type][0] : '未装备'}</b></span>
                {c && <em>{key === 'weapon' ? `距${DEFS[c.type][5]}` : key === 'offhorse' ? '−1' : key === 'horse' ? '+1' : '防'}</em>}
            </button>;
        })}
        {player.delays.map(c => <button className="delay-chip" key={c.id} onClick={() => onInspect(c)}>{DEFS[c.type][0]} · 待判定</button>)}
    </div>;
}

export function TurnTimer({ seconds, total, response, paused }) {
    return <div className={`turn-timer ${seconds <= 10 ? 'urgent' : ''}`} role="timer" aria-label={`${response ? '响应' : '出牌'}剩余${seconds}秒${paused ? '，已暂停' : ''}`}>
        <div><Timer size={16}/><span>{paused ? '计时暂停' : response ? '响应倒计时' : '出牌倒计时'}</span><b>{seconds}<small>秒</small></b></div>
        <div className="timer-track"><span style={{ width: `${Math.min(100, seconds / total * 100)}%` }}/></div>
    </div>;
}

const KIND = { card: '出牌', response: '响应', damage: '伤害', heal: '回复', equip: '装备', skill: '技能', death: '阵亡', turn: '回合', effect: '指向', info: '结算' };
export function BattleLog({ entries, onClose, onPause }) {
    const [filter, setFilter] = useState('all'), [following, setFollowing] = useState(true), [seen, setSeen] = useState(0);
    const [snapshot, setSnapshot] = useState([]), scroller = useRef(null);
    const newest = entries[0]?.id || 0;
    const shown = following ? entries : snapshot;
    const filtered = shown.filter(e => filter === 'all' || filter === 'mine' && (e.actor === 0 || e.target === 0) || filter === 'key' && ['card', 'response', 'damage', 'equip', 'skill', 'death', 'effect'].includes(e.kind));
    function freeze() { setSnapshot([...entries]); setSeen(newest); setFollowing(false); onPause(); }
    function latest() { setFollowing(true); scroller.current?.scrollTo({ top: 0 }); }
    return <aside className="battle-log readable-log" aria-label="实时战报">
        <header><span><ScrollText size={16}/>实时战报</span><button onClick={onClose} aria-label="收起战报"><X size={16}/></button></header>
        <div className="log-filters" role="group" aria-label="战报筛选">{[['all', '全部'], ['key', '关键'], ['mine', '与我相关']].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
        <div className="log-follow"><span>{following ? '最新事件在上方' : '阅读中 · 结算已暂停'}</span><button onClick={following ? freeze : latest}>{following ? '停住阅读' : '返回最新'}</button></div>
        <div className="log-entries" ref={scroller} onScroll={e => { if (following && e.currentTarget.scrollTop > 20) freeze(); }}>
            {filtered.length ? filtered.map(e => <article key={e.id} className={`log-entry event-${e.kind} ${e.actor === 0 || e.target === 0 ? 'involves-you' : ''}`}>
                <div><span className="log-kind">{KIND[e.kind] || '结算'}</span><small>第{e.round}轮 · #{e.id}</small>{(e.actor === 0 || e.target === 0) && <em>与你相关</em>}</div><p>{e.text}</p>
            </article>) : <p className="log-empty">{entries.length ? '暂无符合条件的事件' : '开局后，出牌与结算将逐条显示在这里。'}</p>}
        </div>
        {!following && newest > seen && <button className="log-unread" onClick={latest}>{newest - seen} 条新记录<ChevronDown size={14}/></button>}
    </aside>;
}

export function ActionStage({ cards, entries, Card, onInspect }) {
    const latest = cards.at(-1);
    if (!latest) return <div className="action-stage empty-stage"><Swords size={28}/><span>等待第一张出牌</span><small>出牌者、目标和结果将在这里显示</small></div>;
    const def = DEFS[latest.type];
    const Icon = latest.kind === 'response' ? Shield : def[1] === '锦囊' ? Sparkles : latest.type === 'tao' ? Heart : Swords;
    const start = entries.findIndex(e => e.kind === latest.kind && e.card?.type === latest.type && e.actor === latest.actor);
    const results = (start < 0 ? [] : entries.slice(0, start)).filter(e => ['damage', 'heal', 'equip', 'response', 'skill', 'death'].includes(e.kind)).slice(0, 2).reverse();
    return <div className={`action-stage ink-${def[4]}`}>
        <div className="featured-play" key={latest.seq}>
            <Card card={latest} mini onClick={() => onInspect(latest)}/>
            <div className="play-explanation"><span className="action-category"><Icon size={15}/>{latest.kind === 'response' ? '打出响应' : def[1] === '武器' || def[1] === '防具' || def[1] === '坐骑' ? '装备登场' : `${def[1]} · 当前出牌`}</span>
                <div className="action-route"><b>{latest.by}</b><ArrowRight size={18}/><b>{latest.destination || '自身'}</b></div>
                <h2>{def[0]}</h2><p>{latest.context || def[2]}</p>
            </div>
        </div>
        <div className="action-outcomes" aria-live="polite">{results.length ? results.map(e => <span key={e.id} className={`outcome-${e.kind}`}><Target size={12}/>{e.text}</span>) : <span><Layers size={12}/>正在结算 · 按右上角暂停可停住阅读</span>}</div>
        {cards.length > 1 && <div className="recent-plays"><small>前序出牌</small>{cards.slice(-4, -1).map(c => <button key={c.seq} onClick={() => onInspect(c)}>{c.by}<b>{DEFS[c.type][0]}</b><span>{c.destination || '自身'}</span></button>)}</div>}
    </div>;
}
