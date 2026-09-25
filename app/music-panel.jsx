'use client';
import { Music2, Play, Pause, Check, SkipForward } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { MUSIC_TRACKS, musicTrack, nextMusicTrack } from '@/lib/game/music';

const clock = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;

export function MusicPanel({ config, status, playback = {}, onChange }) {
    const selected = musicTrack(config.bgmTrack);
    const statusText = ({ idle: '开局自动播放，也可现在试听', loading: '正在加载音乐…', playing: '正在播放 · 单曲循环', paused: '音乐已暂停', background: '后台已暂停，返回后继续', blocked: '点击播放以开启音乐', error: '音乐加载失败，请重试或切换曲目' })[status] || '准备播放';
    return <div className="music-panel">
        <div className="music-now-playing"><span className={`music-disc ${status === 'playing' ? 'spinning' : ''}`}><Music2 size={27}/></span><div><small>古风乐坊 · {selected.mood}</small><h3>{selected.name}</h3><p role="status">{statusText}</p></div><Switch checked={config.bgm} onCheckedChange={bgm => onChange({ bgm })} aria-label="背景音乐"/></div>
        <div className="music-transport"><button className="button-gold" onClick={() => onChange({ bgm: status !== 'playing' })}>{status === 'playing' ? <Pause size={16}/> : <Play size={16}/>} {status === 'error' ? '重试播放' : status === 'playing' ? '暂停音乐' : '播放音乐'}</button><button className="button-quiet" onClick={() => onChange({ bgm: true, bgmTrack: nextMusicTrack(config.bgmTrack) })}><SkipForward size={16}/>下一首</button></div>
        <div className="music-progress"><progress aria-label="背景音乐播放进度" max={playback.duration || 1} value={playback.elapsed || 0}/><span><time>{clock(playback.elapsed)}</time><time>{playback.duration ? clock(playback.duration) : selected.duration}</time></span></div>
        <div className="music-track-list" role="group" aria-label="古风背景音乐曲目">{MUSIC_TRACKS.map(track => <button key={track.id} className={`music-track mood-${track.id} ${selected.id === track.id ? 'selected' : ''}`} aria-pressed={selected.id === track.id} onClick={() => onChange({ bgm: true, bgmTrack: track.id })}>
            <span className="music-mood">{track.mood}</span><span className="music-track-info"><b>{track.name}</b><small>{track.texture}</small></span><span className="music-track-time">{track.duration}{selected.id === track.id ? <Check size={15}/> : <Play size={15}/>}</span>
        </button>)}</div>
        <div className="music-volume"><label htmlFor="bgm-volume">背景音乐音量 <b>{config.bgmVolume}%</b></label><input id="bgm-volume" type="range" min="0" max="100" step="1" value={config.bgmVolume} onChange={event => onChange({ bgmVolume: Number(event.target.value) })}/><p>配音时自动压低音乐；切歌渐变，离开页面暂停。</p></div>
        <details className="music-credits"><summary>音乐来源与授权</summary><p>中文名称为游戏内展示名。以下曲目均按 CC BY 4.0 使用，保留原曲旋律，仅统一响度与压缩编码。</p>{MUSIC_TRACKS.map(track => <p key={track.id}><b>{track.name}</b> — <a href={track.source} target="_blank" rel="noreferrer">{track.original}</a><br/>{track.artist} · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>)}<p>Ripples, Ishikari Lore, Mountain Emperor, Shenyang by Kevin MacLeod — <a href="https://incompetech.com" target="_blank" rel="noreferrer">incompetech.com</a></p></details>
    </div>;
}
