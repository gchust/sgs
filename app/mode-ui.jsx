'use client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MODES } from '@/lib/game/modes';
import { portraitRegion, ROLE_NAMES } from '@/lib/game/presentation';
import { teamName } from '@/lib/game/players';

export function Portrait({ hero, className = '' }) {
    const { src, box, width = 1254, height = 1254 } = portraitRegion(hero);
    return <svg className={`portrait ${className}`} viewBox={box.join(' ')} preserveAspectRatio="xMidYMin slice" role="img" aria-label={`${hero.name}立绘`}><image href={src} width={width} height={height}/></svg>;
}
export function GeneralPortrait({ player, own = false, ended = false }) {
    if (!player.generals) return <Portrait hero={player.hero}/>;
    return <span className="dual-portrait">{player.generals.map((hero, i) => <span className={`general-half ${player.revealed[i] ? 'revealed' : 'hidden'}`} key={i}>
        {own || ended || player.revealed[i] ? <Portrait hero={hero}/> : <span className="hidden-general" aria-label={`${i ? '副' : '主'}将未亮出`}><b>{i ? '副' : '主'}</b><small>暗将</small></span>}
        {own && !ended && <em>{i ? '副' : '主'} · {player.revealed[i] ? '明' : '暗'}</em>}
    </span>)}</span>;
}
export function identityLabel(player, mode, ended = false, own = false) {
    if (mode === 'national') return teamName(player.team);
    if (mode === 'duel') return own ? '你' : '对手';
    return own || ended || !player.alive ? ROLE_NAMES[player.role] : '身份未知';
}
export function ModePicker({ value, onChange }) {
    return <Tabs className="mode-picker" value={value} onValueChange={onChange}><TabsList aria-label="对战模式">{Object.entries(MODES).map(([key, mode]) => <TabsTrigger key={key} value={key}>{mode.name}<small>{key === 'national' ? '同势力双将' : key === 'duel' ? '1 对 1' : '暗藏身份'}</small></TabsTrigger>)}</TabsList></Tabs>;
}
export function FactionSummary({ players }) {
    const alive = players.filter(p => p.alive);
    return <div className="faction-summary" aria-label="已公开的存活势力">{['魏', '蜀', '吴', '群'].map(f => <span className={`faction-${f}`} key={f}>{f}<b>{alive.filter(p => p.team === f).length}</b></span>)}<span>野心家 <b>{alive.filter(p => p.team?.startsWith('wild:')).length}</b></span><span>未亮 <b>{alive.filter(p => !p.team).length}</b></span></div>;
}
export function NationalRules() {
    return <div className="national-rules"><p><b>国战 · 双将休闲规则</b>（4–7人）。选择两名同势力武将，体力上限为两将体力之和的一半，向下取整；不增加主公体力。</p><ol>
        <li><b>暗将与亮将</b><p>所有人以暗将入场。准备阶段可亮主将、副将或双将，也可继续隐藏；出牌阶段可随时点亮将按钮。转换牌响应可先亮将再使用技能。未亮出的武将不提供技能，其他玩家看不到其姓名、性别或势力。</p></li>
        <li><b>势力与野心家</b><p>首次亮将决定势力。同势力是队友；若该势力已确定的人数达到初始人数的一半（向下取整），后来亮出的角色成为野心家。阵亡不释放名额；野心家各自为战，彼此也不是队友。</p></li>
        <li><b>胜负与奖惩</b><p>消灭所有其他势力与野心家后，全势力共同获胜，已阵亡队友也获胜；仍有未亮将的存活角色时不提前结算。你阵亡后可观战。已亮将者击败敌人摸2张牌；误杀同势力弃掉所有手牌和装备；暗将击杀无奖励。</p></li>
    </ol><p className="mode-scope">本模式沿用本作39将的图鉴技能与标准牌堆。暂不包含国战专属改版技能、珠联璧合、先驱、阴阳鱼、鏖战、专属牌及全部预亮触发规则。它是一套可完整对局的国战休闲实现。</p><a href="https://www.sanguosha.com/news/20181102_3865_2514" target="_blank" rel="noreferrer">参考：官方国战基础规则 ↗</a></div>;
}
