'use client';
import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import catalog from '../public/assets/voice/characters.json';
import { previewCharacterVoice, stopAudio } from '@/lib/game/audio';
import { assetUrl } from '@/lib/game/assets';

export function VoiceCredits() {
    return <p className="voice-credits">语音来源：<a href={catalog.source.repository} target="_blank" rel="noreferrer">Mogara/QSanguosha</a> · 原始录音
        <br/><a href={catalog.source.licenseUrl} target="_blank" rel="noreferrer">CC BY-NC-ND 4.0</a> · 署名、非商业、禁止分发改编素材 · <a href={assetUrl(`assets/voice/${catalog.source.credits}`)} target="_blank" rel="noreferrer">完整来源</a>
    </p>;
}

export function CharacterVoicePreview({ hero, config }) {
    const [playing, setPlaying] = useState(null);
    const generation = useRef(0), started = useRef(false);
    useEffect(() => () => { generation.current++; if (started.current) stopAudio(); }, []);
    const profile = catalog.characters[hero.id];
    if (!profile) return null;
    async function preview(skill) {
        const token = ++generation.current;
        started.current = true; setPlaying(skill);
        await previewCharacterVoice(hero, skill, config);
        if (generation.current === token) { started.current = false; setPlaying(null); }
    }
    return <div className="hero-voice-preview">
        <small>原始技能录音 · 多条录音依次轮换</small>
        <div>{Object.entries(profile.skills).map(([skill, clips]) => <button key={skill} type="button" className="button-quiet" onClick={() => preview(skill)} aria-label={`试听${hero.name}的${skill}配音`}>
            <Volume2 size={14}/>{playing === skill ? '播放中 · ' : '试听 · '}{skill}（{clips.length}条）
        </button>)}</div>
        {Object.keys(profile.unavailable).length > 0 && <small>{Object.keys(profile.unavailable).join('、')}：源版本无独立录音，保留游戏音效。</small>}
        <VoiceCredits/>
    </div>;
}
