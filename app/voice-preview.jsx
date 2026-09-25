'use client';
import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import catalog from '../public/assets/voice/characters.json';
import { previewCharacterVoice, stopAudio } from '@/lib/game/audio';

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
        <small>{profile.direction} · 每个技能两句轮换</small>
        <div>{Object.keys(profile.skills).map(skill => <button key={skill} type="button" className="button-quiet" onClick={() => preview(skill)} aria-label={`试听${hero.name}的${skill}配音`}>
            <Volume2 size={14}/>{playing === skill ? '播放中 · ' : '试听 · '}{skill}
        </button>)}</div>
    </div>;
}
