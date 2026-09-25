'use client';
import { useState, useRef, useEffect, useEffectEvent } from 'react';
import { Swords, Shield, Heart, Layers, Volume2, VolumeX, Settings2, BookOpen, ScrollText, Maximize, Minimize, ChevronRight, RotateCcw, Play, Pause, Check, Hand, Users, Wind, Info, Sparkles, ArrowRight, ChevronsRight, ArrowDownToLine, Flame, Zap, Target, Package, MoveUpRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Game } from '@/lib/game/engine';
import { HEROES, DEFS } from '@/lib/game/data';
import { SEATS, PHASES } from '@/lib/game/presentation';
import { playSound, stopAudio, unlockAudio, waitForVoice } from '@/lib/game/audio';
import { Equipment, BattleLog, ActionStage, TurnTimer } from './battle-ui';
import { DecisionClock, SPEEDS, timeoutChoice } from '@/lib/game/clock';
import { MODES, normalizeConfig, validateSave } from '@/lib/game/modes';
import { playerName, visibleGenerals, teamName } from '@/lib/game/players';
import { Portrait, GeneralPortrait, ModePicker, FactionSummary, NationalRules, identityLabel } from './mode-ui';
import { MusicPanel } from './music-panel';
import { CharacterVoicePreview, VoiceCredits } from './voice-preview';
import { Music2 } from 'lucide-react';
import { playMusic, syncMusic, stopMusic, setMusicHidden } from '@/lib/game/audio';
import { musicTrack } from '@/lib/game/music';
const DEFAULTS = { mode: 'identity', hero: 'guanyu', deputy: 'zhangfei', count: 7, voice: true, sfx: true, speed: 'normal', motion: true, turnSeconds: 60, responseSeconds: 20, voiceVolume: 80, sfxVolume: 45, bgm: true, bgmTrack: 'serene', bgmVolume: 28 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function Health({ player }) { return <div className="health" aria-label={`体力 ${player.hp}/${player.max}`}><span className="health-pips">{Array.from({ length: player.max }, (_, i) => <Heart key={i} size={14} strokeWidth={1.5} className={i < player.hp ? 'full' : 'empty'}/>)}</span><span className="health-number">{player.hp}<em>/{player.max}</em></span></div>; }
const CARD_ICONS = { sha: Swords, shan: Shield, tao: Heart, wuzhong: Sparkles, guohe: Wind, shunshou: Hand, juedou: Swords, nanman: Flame, wanjian: MoveUpRight, taoyuan: Heart, wugu: Package, wuxie: Shield, lebu: Wind, shandian: Zap };
function PlayingCard({ card, selected = false, disabled = false, onClick, onHover, mini = false, back = false, style, className = '' }) {
    if (back)
        return <div className={`playing-card card-back ${className}`} style={style} aria-hidden="true"><div className="back-border"><span>三</span><span>国</span></div></div>;
    const def = DEFS[card.type], Icon = CARD_ICONS[card.type] || (['武器'].includes(def[1]) ? Swords : def[1] === '防具' ? Shield : Wind);
    return <button type="button" className={`playing-card ink-${def[4]} ${selected ? 'chosen' : ''} ${mini ? 'mini' : ''} ${className}`} style={style} data-hand-id={card.id} disabled={disabled} onClick={onClick} onMouseEnter={() => onHover?.(card)} onFocus={() => onHover?.(card)} aria-label={`${card.suit}${card.rank} ${def[0]}`} aria-pressed={selected}>
  <span className={`card-corner ${['♥', '♦'].includes(card.suit) ? 'red-suit' : ''}`}><b>{card.rank}</b><span>{card.suit}</span></span>
  <span className="card-type-seal">{def[1] === '基本' ? '基' : def[1] === '锦囊' ? '锦' : def[1] === '延时锦囊' ? '延' : '装'}</span>
  <span className="card-emblem"><Icon strokeWidth={1}/></span><span className={`card-title ${def[0].length > 2 ? 'long' : ''}`}>{def[0]}</span><span className="card-caption">{def[1]}</span>
  {selected && <span className="selected-mark"><Check size={12}/></span>}
 </button>;
}
function Picker({ value, onValueChange, items, label }) { return <Select value={String(value)} onValueChange={onValueChange}><SelectTrigger className="game-select" aria-label={label}><SelectValue /></SelectTrigger><SelectContent className="game-select-menu">{items.map(([v, t]) => <SelectItem key={v} value={String(v)}>{t}</SelectItem>)}</SelectContent></Select>; }
function ActionButton({ children, primary = false, ...props }) { return <button type="button" className={primary ? 'button-gold' : 'button-quiet'} {...props}>{children}</button>; }
export default function GameTable() {
    const [config, setConfig] = useState(DEFAULTS), configRef = useRef(DEFAULTS);
    const [musicStatus, setMusicStatus] = useState('idle');
    const [musicPlayback, setMusicPlayback] = useState({ elapsed: 0, duration: 0 });
    useEffect(() => { syncMusic({ bgm: config.bgm, bgmTrack: config.bgmTrack, bgmVolume: config.bgmVolume }); }, [config.bgm, config.bgmTrack, config.bgmVolume]);
    useEffect(() => {
        const updateMusic = event => { setMusicStatus(event.detail.status); setMusicPlayback(event.detail); };
        const visibility = () => setMusicHidden(document.hidden);
        window.addEventListener('game-music-state', updateMusic);
        document.addEventListener('visibilitychange', visibility);
        visibility();
        return () => { window.removeEventListener('game-music-state', updateMusic); document.removeEventListener('visibilitychange', visibility); stopMusic(); };
    }, []);
    function changeMusic(patch) { const next = { ...configRef.current, ...patch }; changeConfig(patch); playMusic(next); }
    const gameRef = useRef(null), [game, setGame] = useState(null), busyRef = useRef(false), [busy, setBusy] = useState(false);
    const [selection, setSelection] = useState(null), [target, setTarget] = useState(null), [conversion, setConversion] = useState(null), [hovered, setHovered] = useState(null);
    const [heroSlot, setHeroSlot] = useState('hero');
    const [panel, setPanel] = useState(null), [inspectHero, setInspectHero] = useState('guanyu'), [filter, setFilter] = useState('all');
    const [response, setResponse] = useState(null), responseRef = useRef(null), [effects, setEffects] = useState([]), timers = useRef(new Set());
    const [notice, setNotice] = useState(''), [saved, setSaved] = useState(null), [auto, setAuto] = useState(false), autoRef = useRef(false), [confirmReset, setConfirmReset] = useState(false), [logOpen, setLogOpen] = useState(true), [full, setFull] = useState(false), [ready, setReady] = useState(false);
    const noticeTimer = useRef(null), shellRef = useRef(null);
    const [paused, setPaused] = useState(false), pacing = useRef({ paused: false, steps: 0 });
    const panelRef = useRef(null), playClock = useRef(new DecisionClock()), responseClock = useRef(new DecisionClock()), promptId = useRef(0);
    const [clock, setClock] = useState({ seconds: 60, total: 60, response: false, paused: false });
    useEffect(() => { panelRef.current = panel || (confirmReset ? 'confirm' : null); }, [panel, confirmReset]);
    function pausePlayback(value = true) { pacing.current.paused = value; pacing.current.steps = 0; setPaused(value); }
    function stepPlayback() { pacing.current.paused = true; pacing.current.steps = 1; setPaused(true); }
    const tickClock = useEffectEvent(elapsed => {
            const g = gameRef.current;
            if (!g || g.over || autoRef.current) return;
            const pending = responseRef.current, settings = configRef.current;
            const blocked = pacing.current.paused || !!panelRef.current || document.hidden;
            const playRunning = g.players[0].alive && !blocked && !pending && !busyRef.current && g.turn === 0 && g.phase === '出牌';
            const play = playClock.current.tick(`${g.round}:0:${settings.turnSeconds}`, settings.turnSeconds, elapsed, playRunning);
            let result = play, total = settings.turnSeconds;
            if (pending) {
                total = settings.responseSeconds;
                result = responseClock.current.tick(pending.id, total, elapsed, !blocked);
                if (result.expired) {
                    g.log(`响应时间到：${pending.optional ? '跳过本次响应' : '采用第一个有效选项'} · ${pending.title}`, { kind: 'info', actor: 0 });
                    answer(timeoutChoice(pending));
                }
            } else if (play.expired) {
                g.log('出牌时间到，自动结束你的出牌阶段', { kind: 'turn', actor: 0 });
                notify('出牌时间到，已自动结束回合。');
                run(current => advance(current));
            }
            const next = { seconds: result.seconds, total, response: !!pending, paused: blocked || (!pending && !playRunning) };
            setClock(previous => Object.keys(next).every(k => previous[k] === next[k]) ? previous : next);
    });
    useEffect(() => {
        let last = performance.now();
        const id = setInterval(() => { const now = performance.now(); tickClock(Math.min(300, now - last)); last = now; }, 100);
        return () => clearInterval(id);
    }, []);
    const update = () => { const current = gameRef.current; setGame(current ? Object.assign(Object.create(Game.prototype), current) : null); };
    function notify(message) { setNotice(message); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(''), 4000); }
    function changeConfig(patch) { setConfig(c => { const next = normalizeConfig({ ...c, ...patch }); configRef.current = next; try {
        localStorage.setItem('mengjiang-v2-config', JSON.stringify(next));
    }
    catch { /* Keep settings in memory when browser storage is unavailable. */ } return next; }); }
    useEffect(() => {
        const activeTimers = timers.current;
        const hydration = requestAnimationFrame(() => {
        try {
            let stored = JSON.parse(localStorage.getItem('mengjiang-v2-config') || 'null');
            if (stored && HEROES.some(h => h.id === stored.hero)) {
                let next = normalizeConfig({ ...DEFAULTS, ...stored });
                configRef.current = next;
                setConfig(next);
            }
            let previous = JSON.parse(localStorage.getItem('mengjiang-v2-save') || 'null');
            if (validateSave(previous))
                setSaved(previous);
        }
        catch { /* Ignore unavailable storage or malformed persisted data. */ }
        if (window.innerWidth <= 1150) setLogOpen(false);
        setReady(true);
        });
        const audioError = () => notify('语音加载失败，可在设置中重试试听；对局仍可继续。');
        window.addEventListener('game-audio-error', audioError);
        const fullscreen = () => setFull(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', fullscreen);
        return () => { cancelAnimationFrame(hydration); window.removeEventListener('game-audio-error', audioError); document.removeEventListener('fullscreenchange', fullscreen); if (gameRef.current)
            gameRef.current.cancelled = true; responseRef.current?.resolve(null); activeTimers.forEach(clearTimeout); clearTimeout(noticeTimer.current); stopAudio(); };
    }, []);
    function checkpoint(g) { if (g !== gameRef.current)
        return; try {
        if (g.over) {
            localStorage.removeItem('mengjiang-v2-save');
            setSaved(null);
            return;
        }
        if (!g.players[0].alive || g.turn !== 0 || g.phase !== '出牌' || responseRef.current)
            return;
        const out = { v: 3, mode: g.mode, pile: g.pile, discard: g.discard, players: g.players, logs: g.logs, table: g.table, turn: g.turn, round: g.round, phase: g.phase, over: false, count: g.count, difficulty: g.difficulty, revision: g.revision, eventId: g.eventId, history: g.history, logId: g.logId };
        const json = JSON.stringify(out);
        localStorage.setItem('mengjiang-v2-save', json);
        setSaved(JSON.parse(json));
    }
    catch { /* Continue the current game when saving is unavailable. */ } }
    function coordinates(pid) { const node = pid === 'deck' ? document.querySelector('[data-deck]') : pid === 'table' ? document.querySelector('[data-table]') : document.querySelector(`[data-player="${pid}"]`); const root = shellRef.current?.getBoundingClientRect(), rect = node?.getBoundingClientRect(); if (!root || !rect)
        return { x: 0, y: 0 }; return { x: rect.x + rect.width / 2 - root.x, y: rect.y + rect.height / 2 - root.y }; }
    async function animate(event) {
        if (!gameRef.current) return;
        const duration = SPEEDS[configRef.current.speed] || SPEEDS.normal;
        const important = ['card', 'damage', 'equip', 'skill', 'death', 'turn', 'trick'].includes(event.type);
        if (configRef.current.motion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const from = coordinates(event.type === 'draw' ? 'deck' : event.from ?? event.to), to = coordinates(event.type === 'card' ? 'table' : event.to ?? event.from);
            const fx = { ...event, from, to, player: event.to, source: event.from, key: `${Date.now()}-${event.id}` };
            setEffects(old => [...old.slice(-12), fx]);
            const timer = setTimeout(() => { setEffects(old => old.filter(e => e.key !== fx.key)); timers.current.delete(timer); }, Math.max(1100, duration));
            timers.current.add(timer);
        }
        // Reading time stays intact even with animations disabled.
        if (important) await delay(event.type === 'card' ? duration : duration * .7);
        else if (event.type === 'attack') await delay(duration * .35);
    }
    async function beforeEvent() {
        await waitForVoice();
        while (pacing.current.paused || panelRef.current || document.hidden) {
            if (!gameRef.current || gameRef.current.cancelled) throw new Error('cancelled');
            if (pacing.current.steps > 0 && !panelRef.current && !document.hidden) { pacing.current.steps--; break; }
            await delay(60);
        }
    }
    function answer(value) { const pending = responseRef.current; if (!pending)
        return; responseRef.current = null; setResponse(null); pending.resolve(value); }
    function request(title, options, optional) {
        if (autoRef.current)
            return Promise.resolve(options[0]?.value ?? null);
        return new Promise(resolve => { const pending = { id: ++promptId.current, title, options, optional, resolve }; responseRef.current = pending; setResponse(pending); setSelection(null); setTarget(null); setPanel(null); });
    }
    function hooks() { return { update, sound: (word, player) => playSound(word, configRef.current, player), effect: animate, beforeEvent, wait: () => delay(120), ask: request }; }
    async function run(action) { if (busyRef.current)
        return; const g = gameRef.current; if (!g)
        return; busyRef.current = true; setBusy(true); setSelection(null); setTarget(null); setConversion(null); try {
        await action(g);
        if (!g.players[0].alive && !g.over)
            await advance(g);
        if (autoRef.current && !g.over)
            await autoplay(g);
        checkpoint(g);
    }
    catch (e) {
        if (e.message !== 'cancelled') {
            console.error('Game action failed', e);
            notify('本次结算未完成，可恢复上一个已保存的出牌阶段。');
            setPanel('recovery');
        }
    }
    finally {
        if (g === gameRef.current) {
            busyRef.current = false;
            setBusy(false);
            update();
            if (g.over) {
                setAuto(false);
                autoRef.current = false;
                setPanel('result');
            }
        }
    } }
    async function advance(g) {
        while (!g.over) {
            if (g.turn === 0)
                await g.finish(0);
            for (let i = 1; i < g.players.length && !g.over; i++) {
                if (!g.players[i].alive)
                    continue;
                await g.pause();
                if (await g.begin(i))
                    await g.ai(i);
                await g.finish(i);
            }
            if (g.over)
                return;
            g.round++;
            const canPlay = await g.begin(0);
            if (canPlay)
                return;
        }
    }
    async function autoplay(g) { while (autoRef.current && !g.over && !g.cancelled) {
        if (g.turn === 0 && g.phase === '出牌')
            await g.ai(0);
        await advance(g);
        await delay(150);
    } }
    async function start(resume = false) {
        if (busyRef.current)
            return;
        unlockAudio();
        playMusic(configRef.current);
        stopAudio();
        pausePlayback(false);
        playClock.current = new DecisionClock();
        responseClock.current = new DecisionClock();
        const g = new Game(configRef.current.hero, 'normal', hooks(), configRef.current.count, { mode: configRef.current.mode, deputy: configRef.current.deputy });
        if (resume && validateSave(saved)) {
            Object.assign(g, JSON.parse(JSON.stringify(saved)));
            g.mode = saved.mode || 'identity';
            g.hooks = hooks();
            g.cancelled = false;
            changeConfig({ mode: g.mode, hero: g.players[0].hero.id, deputy: g.players[0].generals?.[1].id, count: g.count });
        }
        if (gameRef.current)
            gameRef.current.cancelled = true;
        gameRef.current = g;
        setPanel(null);
        setEffects([]);
        setSelection(null);
        setTarget(null);
        setHovered(null);
        setAuto(false);
        autoRef.current = false;
        update();
        playSound('开局', configRef.current);
        if (!resume)
            await run(async (current) => { if (!await current.begin(0))
                await advance(current); });
        else
            checkpoint(g);
    }
    function reset() { stopAudio(); pausePlayback(false); if (gameRef.current)
        gameRef.current.cancelled = true; answer(null); gameRef.current = null; busyRef.current = false; setBusy(false); autoRef.current = false; setAuto(false); setEffects([]); setSelection(null); setTarget(null); setPanel(null); setConfirmReset(false); update(); }
    function toggleAuto() { const next = !autoRef.current; autoRef.current = next; setAuto(next); if (next && responseRef.current)
        answer(responseRef.current.options[0]?.value ?? null); if (next && !busyRef.current && gameRef.current && !gameRef.current.over)
        run(async () => { }); }
    const modeKey = game?.mode || config.mode, mode = MODES[modeKey];
    const previewHeroes = [HEROES.find(h => h.id === config.hero), ...['zhangfei', 'caocao', 'sunshangxiang', 'zhaoyun', 'diaochan', 'zhugeliang', 'lvbu'].filter(id => id !== config.hero).slice(0, config.count - 1).map(id => HEROES.find(h => h.id === id))];
    const players = game?.players || previewHeroes.map((hero, id) => ({ id, hero, role: config.mode === 'identity' ? id === 0 ? 'lord' : 'unknown' : config.mode, ...(config.mode === 'national' ? { generals: [hero, HEROES.find(h => h.id === config.deputy)], revealed: [false, false], team: null } : {}), hp: config.mode === 'national' ? Math.floor((hero.hp + HEROES.find(h => h.id === config.deputy).hp) / 2) : hero.hp + (config.mode === 'identity' && id === 0 && config.count >= 5 ? 1 : 0), max: config.mode === 'national' ? Math.floor((hero.hp + HEROES.find(h => h.id === config.deputy).hp) / 2) : hero.hp + (config.mode === 'identity' && id === 0 && config.count >= 5 ? 1 : 0), alive: true, hand: [], equip: {}, delays: [], scars: [] }));
    const self = players[0], active = game && !game.over, canAct = active && self.alive && game.turn === 0 && game.phase === '出牌' && !busy;
    const card = self.hand.find(c => c.id === selection), cardType = conversion || card?.type;
    const pendingCards = response?.options.filter(o => o.card) || [];
    const responseInHand = pendingCards.length > 0 && pendingCards.every(o => self.hand.some(c => c.id === o.card.id));
    const validTargets = card && canAct ? players.filter(p => p.id !== 0 && p.alive && !game.valid(self, card, p, cardType)).map(p => p.id) : [];
    const requiresTarget = card && ['sha', 'juedou', 'guohe', 'shunshou', 'lebu'].includes(cardType);
    const responseTargets = response?.options.filter(o => !o.card && players.some(p => p.id === o.value && o.label.startsWith(playerName(p) + ' ·'))) || [];
    const selectedHero = HEROES.find(h => h.id === inspectHero) || HEROES[0];
    const shownCard = hovered || card;
    function chooseCard(c) { if (response) {
        const option = response.options.find(o => o.card?.id === c.id);
        if (option)
            answer(option.value);
        return;
    } if (!canAct)
        return; setSelection(selection === c.id ? null : c.id); setConversion(null); setTarget(null); setHovered(c); }
    function playSelected() { if (!card)
        return; const error = game.valid(self, card, players.find(p => p.id === target), cardType); if (error)
        return notify(error); const id = card.id, type = conversion, t = target; run(g => g.play(0, id, t, type)); }
    let title = '准备就绪，随时开局';
    if (response)
        title = response.title;
    else if (game?.over)
        title = game.resultTitle || (game.over === 'win' ? '主忠获胜' : '本局结束');
    else if (canAct) {
        title = card ? `已选择「${DEFS[cardType][0]}」` : '你的出牌阶段';
        if (card && requiresTarget)
            title += target === null ? ' · 请选择目标' : ` → ${playerName(players[target])}`;
    }
    else if (game)
        title = auto ? '托管进行中' : `${playerName(players[game.turn])} · ${game.phase}阶段`;
    const subTitle = response ? (responseInHand ? `请选择下方高亮手牌；${config.responseSeconds}秒内响应。` : '选择后继续结算，牌桌始终保持可见。') : !game ? `${config.count}人${mode.name} · 一位玩家，其余为电脑` : !self.alive ? '你已阵亡，正在观战。同势力仍可带你获胜。' : canAct ? (card ? DEFS[cardType][2] : '点选手牌 → 选择亮起的目标 → 确认出牌。') : '等待结算；你需要响应时，会在这里出现提示。';
    return <main ref={shellRef} className={`game-shell ${game && logOpen ? 'with-log' : ''} ${!active ? 'in-lobby' : ''} ${config.motion ? '' : 'no-motion'}`} data-mode={modeKey} data-player-count={players.length} data-game-state={!game ? 'lobby' : game.over || game.phase}>
  <div className="scene-art"/><div className="scene-shade"/>
  <header className="game-header">
   <button className="game-brand" onClick={() => { if (active)
        setConfirmReset(true); }} aria-label="萌将三国"><span className="brand-stamp">萌</span><span><strong>萌将三国</strong><small>桃 园 演 武</small></span></button>
   <div className="header-mode"><span className="mode-dot"/>{mode.name} · 单人演武<span className="mode-separator"/>标准 ＋ 风 ＋ 拓展</div>
   <nav className="game-toolbar" aria-label="游戏工具">
    {active && <div className="playback-controls"><button onClick={() => pausePlayback(!paused)} aria-label={paused ? '继续结算' : '暂停结算'} className={paused ? 'active' : ''}>{paused ? <Play/> : <Pause/>}<span>{paused ? '继续' : '暂停'}</span></button><button onClick={stepPlayback} aria-label="单步结算" title="暂停后逐条查看结算"><ChevronsRight/><span>单步</span></button><select aria-label="对局播放速度" value={config.speed} onChange={e => changeConfig({ speed: e.target.value })}><option value="slow">慢速</option><option value="normal">标准</option><option value="fast">快速</option></select></div>}
    <button onClick={() => { setHeroSlot('hero'); setInspectHero(self.hero.id); setFilter('all'); setPanel('heroes'); }} title="武将图鉴" aria-label="武将图鉴"><Users /><span>武将</span></button>
    <button onClick={() => setPanel('rules')} title="游戏规则" aria-label="游戏规则"><BookOpen /><span>规则</span></button>
    <button onClick={() => { setLogOpen(!logOpen); if (!logOpen && window.innerWidth <= 1150 && active) pausePlayback(true); }} className={logOpen ? 'active' : ''} title="对局记录" aria-label="对局记录"><ScrollText /><span>战报</span></button>
    <i />
    <button onClick={() => { changeConfig({ voice: !config.voice }); if (!config.voice) unlockAudio(); if (config.voice)
        stopAudio(); }} aria-label={config.voice ? '关闭配音' : '开启配音'}>{config.voice ? <Volume2 /> : <VolumeX />}</button>
    <button className={`music-toolbar-button ${musicStatus === 'playing' ? 'active' : ''}`} onClick={() => setPanel('music')} aria-label="背景音乐" title={`古风乐坊 · ${musicTrack(config.bgmTrack).name}`}><Music2/><span>音乐</span></button>
    <button onClick={() => setPanel('settings')} aria-label="游戏设置"><Settings2 /></button>
    <button className="fullscreen-button" onClick={async () => { try {
        if (document.fullscreenElement)
            await document.exitFullscreen();
        else
            await shellRef.current.requestFullscreen();
    }
    catch {
        notify('当前浏览器不支持全屏');
    } }} aria-label={full ? '退出全屏' : '全屏游戏'}>{full ? <Minimize /> : <Maximize />}</button>
   </nav>
  </header>
  <section className="arena" aria-label={`${players.length}人对战牌桌`}>
   <div className="table-oval" aria-hidden="true"/><div className="arena-meta"><span><Users size={14}/>{players.filter(p => p.alive).length} / {players.length}</span><span>{game ? `第 ${game.round} 轮` : '自由选将'}</span><span className="hidden-on-small">{game ? '顺序按座次逆时针轮转' : '一位玩家，其余为电脑'}</span></div>
   {game && modeKey === 'national' && <FactionSummary players={players}/>}
   <div className="deck-stack" data-deck><PlayingCard back/><span><Layers size={12}/>{game?.pile.length ?? 106}</span><small>弃牌 {game?.discard.length ?? 0}</small></div>
   {players.slice(1).map((p, index) => {
            const revealed = visibleGenerals(p);
            const faction = modeKey === 'national' ? p.team ? p.team.startsWith('wild:') ? '野' : p.team : '?' : p.hero.faction;
            const pos = SEATS[players.length][index];
            const isTurn = active && game.turn === p.id;
            const isTarget = target === p.id;
            const latestPlay = game?.table.at(-1);
            const equipmentEvent = game?.history.find(e => e.kind === 'equip' && e.actor === p.id);
            const responseTarget = responseTargets.find(o => o.value === p.id);
            const legal = !!responseTarget || !!requiresTarget && validTargets.includes(p.id);
            const damage = effects.find(e => e.type === 'damage' && e.player === p.id), dodge = effects.find(e => e.type === 'dodge' && e.player === p.id), heal = effects.find(e => e.type === 'heal' && e.player === p.id);
            return <article key={p.id} className={`seat seat-${index + 1} ${latestPlay?.actor === p.id ? 'action-source' : ''} ${latestPlay?.target === p.id ? 'action-recipient' : ''} ${isTurn ? 'current-turn' : ''} ${isTarget ? 'targeted' : ''} ${legal ? 'can-target' : ''} ${requiresTarget && !legal ? 'invalid-target' : ''} ${p.alive ? '' : 'defeated'} ${damage ? 'taking-damage' : ''} ${dodge ? 'dodging' : ''} ${heal ? 'healing' : ''}`} style={{ '--seat-x': `${pos[0]}%`, '--seat-y': `${pos[1]}%` }} data-player={p.id}>
    <span className="seat-number">{String(p.id + 1).padStart(2, '0')}<em>{isTurn ? game.phase : p.flipped ? '翻面' : '电脑'}</em></span>
    <button className="seat-main" aria-label={`${requiresTarget || responseTarget ? '选择目标' : '查看武将'} ${playerName(p)}`} aria-pressed={isTarget} onClick={() => { if (responseTarget) {
                answer(responseTarget.value);
                return;
            } if (requiresTarget) {
                if (legal)
                    setTarget(isTarget ? null : p.id);
                else
                    notify(game.valid(self, card, p, cardType) || '不能选择该目标');
            }
            else {
                if (!revealed.length) return notify('该角色仍是暗将，尚未公开武将与势力。');
                setHeroSlot('hero'); setFilter('all'); setInspectHero(revealed[0].id);
                setPanel('heroes');
            } }}>
     <GeneralPortrait player={p} ended={!!game?.over}/><span className={`faction-flag faction-${faction}`}>{faction}</span>
     <span className={`identity ${!p.alive || game?.over ? p.role : 'unknown'}`}>{identityLabel(p, modeKey, !!game?.over)}</span>
     <div className="seat-caption"><span>{playerName(p)}</span><span className="opponent-hand"><Layers size={13}/>{game ? p.hand.length : 4}</span></div>
     {isTarget && <span className="target-crosshair"><Target size={35}/></span>}{!p.alive && <span className="death-seal">阵亡</span>}
    </button><Health player={p}/><div className="seat-skill" title={revealed.map(h => h.desc).join(" / ")}>{revealed.length ? revealed.map(h => h.skill).join(" / ") : "暗将 · 技能未启用"}</div>
    <Equipment compact player={p} recent={equipmentEvent?.card?.id} onInspect={c => { setHovered(c); setPanel('card'); }}/>

   </article>;
        })}
   <div className="table-center" data-table>
    {!game ? <div className="lobby-console"><span className="lobby-eyebrow"><span/>桃园已备席<span/></span>
        <ModePicker value={config.mode} onChange={value => changeConfig({ mode: value })}/>
        <h1>{mode.title}</h1><p>{mode.description}</p>
        {config.mode === 'national' && <div className="dual-selection">{[['hero', '主将'], ['deputy', '副将']].map(([key, label]) => { const h = HEROES.find(h => h.id === config[key]); return <button key={key} onClick={() => { setHeroSlot(key); setInspectHero(h.id); setFilter('all'); setPanel('heroes'); }}><Portrait hero={h}/><span><small>{label} · {h.faction}</small><b>{h.name}</b><em>{h.skill}</em></span><ChevronRight size={16}/></button>; })}<small>同势力双将 · 体力 {self.max} · 点击更换</small></div>}
        <div className="lobby-settings"><Picker value={config.count} onValueChange={v => changeConfig({ count: Number(v) })} items={mode.counts.map(n => [n, `${n} 人 · 你与 ${n - 1} 位电脑`])} label="对局人数"/></div>
        <ActionButton primary onClick={() => start()} disabled={!ready}><Swords size={18}/>开始{mode.name}<ArrowRight size={17}/></ActionButton>
        {saved && <button className="resume-game" onClick={() => start(true)}>继续上次{MODES[saved.mode || 'identity'].name} · 第 {saved.round} 轮<ChevronRight size={13}/></button>}
        <small>{config.mode === 'national' ? '双将休闲规则 · 沿用标风技能' : config.mode === 'duel' ? '一名武将，一次机会 · 在下方更换武将' : '你是主公 · 在下方更换武将'}</small>
        <button className="mode-rules-link" onClick={() => setPanel('rules')}>查看模式规则与胜利条件<ChevronRight size={12}/></button>
    </div> : game.over ? <div className="end-console"><span>{game.over === 'win' ? '勝' : '终'}</span><h2>{game.over === 'win' ? '大获全胜' : '来日再战'}</h2><ActionButton primary onClick={() => setPanel('result')}>查看战报</ActionButton></div> : <>
     <ActionStage cards={game.table} entries={game.history} Card={PlayingCard} onInspect={c => { setHovered(c); setPanel('card'); }}/>

    </>}
   </div>
   {logOpen && game && <BattleLog entries={game.history} onClose={() => setLogOpen(false)} onPause={() => pausePlayback(true)}/>}
   {active && paused && <div className="paused-banner"><Pause size={14}/>结算已暂停<button onClick={() => pausePlayback(false)}>继续</button><button onClick={stepPlayback}>下一步</button></div>}

   <div className="arena-footer"><span><Shield size={12}/> {active ? modeKey === 'national' ? `你的势力：${teamName(self.team)}` : modeKey === 'duel' ? '击败对手即获胜' : '身份在阵亡后揭晓' : `标风 33 将 · 拓展 6 将`}</span><span>{active ? `${playerName(players[game.turn])} 的回合` : '江山如画 · 且听风吟'}</span></div>
  </section>
  <section className={`player-dock ${response ? 'awaiting-response' : ''}`} aria-label="你的手牌与操作区">
   <div className="phase-track">{PHASES.map((phase, i) => <span key={phase} className={game?.phase === phase && !game.over ? 'active' : ''}><small>{i + 1}</small>{phase}{i < 5 && <ChevronRight size={10}/>}</span>)}</div>
   <div className={`self-player ${effects.some(e => e.type === 'damage' && e.player === 0) ? 'taking-damage' : ''}`} data-player="0">
    <button className="self-portrait" onClick={() => { setHeroSlot('hero'); setInspectHero(self.hero.id); setFilter('all'); setPanel('heroes'); }} aria-label="更换或查看你的武将"><GeneralPortrait player={self} own ended={!!game?.over}/><span className={`identity ${self.role}`}>{identityLabel(self, modeKey, !!game?.over, true)}</span><span className="self-seat-number">01</span><span className="portrait-action">{active ? '武将详情' : '更换武将'}<ChevronRight size={12}/></span></button>
    <div className="self-summary"><span className={`faction-label faction-${self.team?.startsWith('wild:') ? '野' : self.hero.faction}`}>{self.team?.startsWith('wild:') ? '野' : self.hero.faction}</span><h2>{self.generals ? self.generals.map(h => h.name).join("·") : self.hero.name}</h2><Health player={self}/></div>
    <div className="skill-controls">{(self.generals || [self.hero]).map((h, i) => <button className="own-general-detail" key={h.id} onClick={() => { setHeroSlot(i ? 'deputy' : 'hero'); setInspectHero(h.id); setFilter('all'); setPanel('heroes'); }} title={h.desc}>{self.generals ? `${h.name} · ${self.revealed[i] ? '明' : '暗'}` : h.skill}</button>)}{canAct && game.skills(self).map(([key, label]) => <button key={key} onClick={() => run(async (g) => { await g.skill(0, key); if (g.phase === '弃牌' && !g.over)
        await advance(g); })}>{label}<ChevronRight size={11}/></button>)}</div>
   </div>
   <div className="hand-workspace">
    <div className="decision-header"><div><strong className={response ? 'needs-response' : ''}>{response ? <Shield size={16}/> : canAct ? <Swords size={16}/> : <Wind size={16}/>} {title}</strong><p>{subTitle}</p></div><span className="hand-counter"><Layers size={15}/>{game ? self.hand.length : 4}<small>手牌</small></span></div>
    {card && canAct && game.conversions(self, card).length > 1 && <div className="conversion-row"><span>卡牌转换</span>{game.conversions(self, card).map(type => <button key={type} className={type === cardType ? 'selected' : ''} onClick={() => { setConversion(type); setTarget(null); }}>{type === card.type ? '直接使用' : `转为${DEFS[type][0]}`}</button>)}</div>}
    {response && <div className="response-choices" aria-live="polite">{response.options.filter(o => !responseInHand || !o.card).map((option, i) => option.card ? <PlayingCard key={i} card={option.card} mini onClick={() => answer(option.value)}/> : <button key={i} className="response-option" onClick={() => answer(option.value)}>{option.label}<ChevronRight size={12}/></button>)}{responseInHand && <span className="hand-response-hint"><ArrowDownToLine size={15}/>点击下方亮起的手牌</span>}{response.optional && <button className="skip-response" onClick={() => answer(null)}>不发动 / 跳过</button>}</div>}
    <div className="hand-scroll"><div className="hand-cards" style={{ '--hand-count': Math.max(1, self.hand.length) }}>{game ? self.hand.map((c, i) => { const legalResponse = response?.options.some(o => o.card?.id === c.id); return <PlayingCard key={c.id} card={c} selected={selection === c.id} className={legalResponse ? 'response-legal' : ''} style={{ '--card-index': i }} disabled={response ? !legalResponse : !canAct} onClick={() => chooseCard(c)} onHover={setHovered}/>; }) : Array.from({ length: 4 }, (_, i) => <PlayingCard key={i} back style={{ '--card-index': i }}/>)}</div></div>
    <div className="equipment-strip"><Equipment player={self} recent={game?.history.find(e => e.kind === 'equip' && e.actor === 0)?.card?.id} onInspect={c => { setHovered(c); setPanel('card'); }}/><span className="distance-info">攻击范围 {game ? game.range(self) : 1} · 手牌上限 {Math.max(0, self.hp)}</span></div>
   </div>
   <div className="command-panel">
    {active && self.alive && !auto && (game.turn === 0 || response) && <TurnTimer {...clock}/>}

    <span className="command-eyebrow">{response ? '等 待 响 应' : canAct ? '轮 到 你 了' : '运 筹 帷 幄'}</span>
    <ActionButton primary disabled={!card || !canAct || (requiresTarget && target === null)} onClick={playSelected}><Check size={17}/>确认出牌</ActionButton>
    <ActionButton disabled={!canAct} onClick={() => run(g => advance(g))}>结束回合<ChevronsRight size={15}/></ActionButton>
    {active && self.alive ? <button className={`auto-control ${auto ? 'on' : ''}`} onClick={toggleAuto}>{auto ? <Pause size={13}/> : <Play size={13}/>} {auto ? '取消托管' : '托管'}</button> : <button className="auto-control" onClick={() => setPanel('rules')}><Info size={13}/>了解玩法</button>}
    {selection && canAct && <button className="clear-selection" onClick={() => { setSelection(null); setConversion(null); setTarget(null); }}>取消选择</button>}
   </div>
  </section>
  <footer className="game-status"><span>{shownCard ? <><b>{DEFS[shownCard.type][0]}</b> {DEFS[shownCard.type][2]}</> : <><span className="connection-light"/>本机演武 · 无需联网等待</>}</span><button onClick={() => setPanel('rules')}>玩法说明<ChevronRight size={12}/></button></footer>
  <div className="fx-layer" aria-hidden="true">{effects.map(e => {
            if (e.type === 'card')
                return <div key={e.key} className="fx-flying-card" style={{ left: e.from.x, top: e.from.y, '--dx': `${e.to.x - e.from.x}px`, '--dy': `${e.to.y - e.from.y}px` }}><PlayingCard card={e.card} mini/></div>;
            if (e.type === 'equip' || e.type === 'skill')
                return <div key={e.key} className={`fx-callout fx-${e.type}`} style={{ left: e.to.x, top: e.to.y }}>{e.type === 'equip' ? <Shield size={27}/> : <Sparkles size={27}/>}<b>{e.name || DEFS[e.card.type][0]}</b><small>{e.type === 'equip' ? '装备完成' : '技能发动'}</small></div>;
            if (e.type === 'attack' || e.type === 'trick') {
                const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y, len = Math.hypot(dx, dy), angle = Math.atan2(dy, dx) * 180 / Math.PI;
                return <div key={e.key} className={`fx-attack-line ${e.type === 'trick' ? 'fx-trick-line ink-' + DEFS[e.card.type][4] : ''} ${e.card?.thunder ? 'thunder-strike' : ''}`} style={{ left: e.from.x, top: e.from.y, width: len, transform: `rotate(${angle}deg)` }}>{e.type === 'trick' && <span style={{ transform: `rotate(${-angle}deg)` }}>{DEFS[e.card.type][0]}</span>}</div>;
            }
            if (e.type === 'draw')
                return <div key={e.key} className="fx-draw" style={{ left: e.from.x, top: e.from.y, '--dx': `${e.to.x - e.from.x}px`, '--dy': `${e.to.y - e.from.y}px` }}><Layers size={25}/></div>;
            if (e.type === 'turn')
                return <div key={e.key} className="fx-turn-announcement"><span>{e.player === 0 ? '你的回合' : `${e.name} 的回合`}</span><small>准备阶段</small></div>;
            if (['damage', 'heal', 'dodge', 'death'].includes(e.type))
                return <div key={e.key} className={`fx-number fx-${e.type}`} style={{ left: e.to.x, top: e.to.y }}>{e.type === 'damage' ? `−${e.n} 伤害` : e.type === 'heal' ? `+${e.n} 回复` : e.type === 'dodge' ? '闪 · 抵消' : '阵亡'}</div>;
            return null;
        })}</div>
  {notice && <div className="game-toast" role="status"><Info size={15}/>{notice}</div>}
  <Dialog open={!!panel} onOpenChange={open => { if (!open)
        setPanel(null); }}><DialogContent className={`game-dialog ${panel === 'heroes' ? 'hero-dialog' : ''}`}><DialogHeader><DialogTitle>{({ music: '古风乐坊', heroes: '将星录', rules: '桃园演武 · 规则', settings: '游戏设置', result: '本局战报', card: shownCard ? DEFS[shownCard.type][0] : '卡牌说明', recovery: '恢复对局' })[panel]}</DialogTitle><DialogDescription>{({ music: '四种心境，伴一局三国。', heroes: '39位武将 · 标准25将、风包8将、拓展6将。', rules: '每一次出牌，都有它的时机。', settings: '按你的习惯，调整这场演武。', result: `第 ${game?.round || 1} 轮 · ${players.length} 人${mode.name}`, card: '卡牌效果与使用时机', recovery: '发生结算异常，你可以恢复到上一个完整存档。' })[panel]}</DialogDescription></DialogHeader>
   {panel === 'heroes' && <>{!active && config.mode === 'national' && <div className="hero-slot-selector"><button aria-pressed={heroSlot === 'hero'} onClick={() => { setHeroSlot('hero'); setInspectHero(config.hero); setFilter('all'); }}>选择主将</button><button aria-pressed={heroSlot === 'deputy'} onClick={() => { setHeroSlot('deputy'); setInspectHero(config.deputy); setFilter('all'); }}>选择副将 · {self.hero.faction}势力</button><small>主副将必须同势力且不能重复</small></div>}<Tabs value={filter} onValueChange={setFilter} className="hero-tabs"><TabsList><TabsTrigger value="all">全部 {HEROES.length}</TabsTrigger><TabsTrigger value="标">标准 25</TabsTrigger><TabsTrigger value="风">风包 8</TabsTrigger><TabsTrigger value="拓">拓展 6</TabsTrigger></TabsList></Tabs><div className="hero-gallery">{HEROES.filter(h => (filter === 'all' || h.pack === filter) && (active || config.mode !== 'national' || heroSlot !== 'deputy' || h.faction === self.hero.faction && h.id !== config.hero)).map(h => <button key={h.id} className={`hero-tile ${inspectHero === h.id ? 'selected' : ''}`} onClick={() => setInspectHero(h.id)} aria-label={`查看 ${h.name}`}><Portrait hero={h}/><span className={`faction-flag faction-${h.faction}`}>{h.faction}</span><span className="hero-tile-name">{h.name}<small>{h.pack}</small></span></button>)}</div><div className="hero-inspector"><Portrait hero={selectedHero}/><div><h3>{selectedHero.name}<span>{selectedHero.hp} 体力</span></h3><h4>{selectedHero.skill}</h4><p>{selectedHero.desc}</p><CharacterVoicePreview key={selectedHero.id} hero={selectedHero} config={config}/></div>{!active && <ActionButton primary disabled={config.mode === 'national' && heroSlot === 'deputy' && (selectedHero.id === config.hero || selectedHero.faction !== self.hero.faction)} onClick={() => { changeConfig({ [config.mode === 'national' ? heroSlot : 'hero']: selectedHero.id }); if (game?.over)
        reset(); setPanel(null); }}>选择此将<Check size={14}/></ActionButton>}</div></>}
   {panel === 'music' && <MusicPanel config={config} status={musicStatus} playback={musicPlayback} onChange={changeMusic}/>}
   {panel === 'settings' && <div className="settings-content"><div className="setting-item"><span>背景音乐<small>{musicTrack(config.bgmTrack).mood} · {musicTrack(config.bgmTrack).name}</small></span><button className="button-quiet" onClick={() => setPanel('music')}><Music2 size={16}/>选择音乐</button></div><div className="setting-item"><span>中文配音<small>QSanguosha 原始录音，角色技能与男女出牌配音</small></span><Switch checked={config.voice} onCheckedChange={value => { changeConfig({ voice: value }); if (!value) stopAudio(); else unlockAudio(); }} aria-label="中文配音"/></div><div className="setting-item"><span>游戏音效<small>出牌、格挡、受伤与回复提示音</small></span><Switch checked={config.sfx} onCheckedChange={value => changeConfig({ sfx: value })} aria-label="游戏音效"/></div><div className="setting-item"><span>动态效果<small>尊重系统的减少动态效果设置</small></span><Switch checked={config.motion} onCheckedChange={value => changeConfig({ motion: value })} aria-label="动态效果"/></div><div className="setting-item"><span>电脑行动速度</span><Picker value={config.speed} onValueChange={value => changeConfig({ speed: value })} items={[["slow", "慢速 · 充分阅读"], ["normal", "标准 · 清晰结算"], ["fast", "快速"]]} label="电脑行动速度"/></div><div className="setting-item"><span>出牌时限<small>仅计算可操作时间，结算与阅读暂停计时</small></span><Picker value={config.turnSeconds} onValueChange={v => changeConfig({ turnSeconds: Number(v) })} items={[[30, '30秒'], [60, '60秒'], [90, '90秒'], [120, '120秒']]} label="出牌时限"/></div><div className="setting-item"><span>响应时限<small>超时跳过可选响应，必选操作使用首个有效选项</small></span><Picker value={config.responseSeconds} onValueChange={v => changeConfig({ responseSeconds: Number(v) })} items={[[15, '15秒'], [20, '20秒'], [30, '30秒'], [60, '60秒']]} label="响应时限"/></div><div className="setting-item"><label htmlFor="voice-volume">语音音量 {config.voiceVolume}%</label><input id="voice-volume" type="range" min="0" max="100" value={config.voiceVolume} onChange={e => changeConfig({ voiceVolume: Number(e.target.value) })}/></div><div className="setting-item"><label htmlFor="sfx-volume">音效音量 {config.sfxVolume}%</label><input id="sfx-volume" type="range" min="0" max="100" value={config.sfxVolume} onChange={e => changeConfig({ sfxVolume: Number(e.target.value) })}/></div><div className="setting-item"><span>下一局人数</span><Picker value={config.count} onValueChange={value => changeConfig({ count: Number(value) })} items={MODES[config.mode].counts.map(n => [n, `${n} 人`])} label="下一局人数"/></div><VoiceCredits/><div className="dialog-actions"><ActionButton onClick={() => { unlockAudio(); stopAudio(); playSound('杀', { ...config, voice: true, sfx: false }); }}>试听出牌配音</ActionButton>{active && <ActionButton onClick={() => { setPanel(null); setConfirmReset(true); }}><RotateCcw size={14}/>重新选将</ActionButton>}<ActionButton primary onClick={() => setPanel(null)}>完成</ActionButton></div></div>}
   {panel === 'rules' && <div className="rules-content"><Tabs defaultValue={modeKey === 'national' ? 'national' : modeKey === 'duel' ? 'duel' : 'flow'}><TabsList><TabsTrigger value="flow">出牌流程</TabsTrigger><TabsTrigger value="identity">身份</TabsTrigger><TabsTrigger value="duel">单挑</TabsTrigger><TabsTrigger value="national">国战</TabsTrigger><TabsTrigger value="scope">版本说明</TabsTrigger></TabsList><TabsContent value="flow"><ol><li><b>摸牌</b><p>初始每人4张手牌。回合依次经历准备、判定、摸牌、出牌、弃牌、结束。通常摸2张牌。</p></li><li><b>出牌</b><p>点击手牌，若需要目标，点击牌桌上亮起的武将，再确认出牌。通常每回合使用一次杀，装备与技能会改变限制。</p></li><li><b>响应</b><p>被杀时可出闪；决斗时出杀；濒死可用桃。响应面板位于手牌上方，默认20秒倒计时；出牌阶段默认60秒。点击高亮手牌响应。设置、暂停或切换到后台时停止计时。</p></li><li><b>结束</b><p>结束回合后，弃到体力值对应的手牌上限。托管可以代你操作，再次点击可随时接回。</p></li></ol></TabsContent><TabsContent value="identity"><p>你固定扮演主公，其他角色由电脑控制，身份在阵亡后揭晓。</p><div className="identity-rules"><p><b className="role-lord">主公 / 忠臣</b>消灭所有反贼与内奸。</p><p><b className="role-rebel">反贼</b>击败主公。</p><p><b className="role-spy">内奸</b>先消灭其他角色，最后与主公单挑获胜。</p></div><p>七人配置：1 主公、2 忠臣、3 反贼、1 内奸。5 人及以上主公增加1点体力。击败反贼摸3张；主公误杀忠臣弃掉所有手牌和装备。</p><p>距离按存活角色的环桌座位取较短路径，阵亡角色不占距离。武器决定攻击范围，马匹与马术修正距离。</p></TabsContent><TabsContent value="duel"><p><b>单挑 · 一将一命</b>。你与一位电脑对决，各选一名武将，初始摸4张牌，击败对方立即获胜。体力按武将图鉴，不加主公体力，也无击杀奖励。</p><p>保留现有武将技能与标准牌堆。这是简洁的1对1玩法，不包含官方1V1选将禁将、候补武将与替换上场机制。</p></TabsContent><TabsContent value="national"><NationalRules/></TabsContent><TabsContent value="scope"><p>本作是以标风为基础、加入六位拓展武将的单人人机实现，并非官方客户端或完整官方规则复刻。</p><p>包含标准25将、风8将、拓展6将、106张标准牌类，未加入军争牌与赠送神将。花色点数为重新编排。观星仅整理顶牌，遗计每次可分配一张，主公技尚未启用；其他技能依武将图鉴说明结算。</p><p>39名武将均使用原创生成立绘，按原始比例裁切。技能及出牌配音使用 Mogara/QSanguosha 公开仓库原始录音，来源与素材许可见设置。存档保存在当前浏览器，于可操作的出牌阶段保存。</p></TabsContent></Tabs></div>}
   {panel === 'card' && shownCard && <div className="card-detail"><PlayingCard card={shownCard}/><div><span>{DEFS[shownCard.type][1]}</span>{shownCard.by && <p className="card-history-context"><b>{shownCard.by}</b> → {shownCard.destination || '自身'}<small>出牌记录 #{shownCard.seq}</small></p>}<p>{DEFS[shownCard.type][2]}</p></div></div>}
   {panel === 'result' && game && <div className="result-content"><div className="result-banner"><span>{game.over === 'win' ? '勝' : '战'}</span><div><h2>{game.resultTitle || (game.over === 'win' ? '主忠获胜' : game.winner === 'spy' ? '内奸获胜' : '反贼获胜')}</h2><p>{game.over === 'win' ? '运筹有方，桃园再添佳话。' : '胜败乃兵家常事，下一局再战。'}</p></div></div><div className="result-roster">{players.map(p => <div key={p.id}><GeneralPortrait player={p} ended/><span>{p.generals ? p.generals.map(h => h.name).join("·") : p.hero.name}<small className={`role-${p.role}`}>{identityLabel(p, modeKey, true, p.id === 0)}</small></span><span>{p.alive ? '存活' : '阵亡'}</span></div>)}</div><div className="dialog-actions"><ActionButton onClick={reset}>重新选将</ActionButton><ActionButton primary onClick={() => start()}><RotateCcw size={14}/>再来一局</ActionButton></div></div>}
   {panel === 'recovery' && <div className="dialog-actions"><ActionButton onClick={reset}>返回选将</ActionButton><ActionButton primary disabled={!saved} onClick={() => start(true)}>恢复上个出牌阶段</ActionButton></div>}
  </DialogContent></Dialog>
  <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}><AlertDialogContent className="game-dialog"><AlertDialogHeader><AlertDialogTitle>返回选将？</AlertDialogTitle><AlertDialogDescription>当前对局会停止。最近一次保存的出牌阶段仍可在开始页继续。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>继续对局</AlertDialogCancel><AlertDialogAction onClick={reset}>返回选将</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </main>;
}
