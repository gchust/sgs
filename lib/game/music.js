import { assetUrl } from './assets.js';

export const MUSIC_TRACKS = [
    { id: 'serene', name: '烟雨江南', mood: '优美', texture: '疏朗筝音 · 静水流深', original: 'Ripples', artist: 'Kevin MacLeod', duration: '3:25', source: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100691' },
    { id: 'sorrow', name: '月下思归', mood: '悲伤', texture: '筝笛低回 · 惆怅思乡', original: 'Ishikari Lore', artist: 'Kevin MacLeod', duration: '2:44', source: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100192' },
    { id: 'heroic', name: '万里山河', mood: '激昂', texture: '战鼓齐鸣 · 金石激荡', original: 'Mountain Emperor', artist: 'Kevin MacLeod', duration: '3:20', source: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700012' },
    { id: 'joyful', name: '春日游园', mood: '快乐', texture: '二胡琵琶 · 轻快明亮', original: 'Shenyang', artist: 'Kevin MacLeod', duration: '2:31', source: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600066' },
];
export const musicTrack = id => MUSIC_TRACKS.find(track => track.id === id) || MUSIC_TRACKS[0];
export const nextMusicTrack = id => MUSIC_TRACKS[(MUSIC_TRACKS.findIndex(track => track.id === id) + 1) % MUSIC_TRACKS.length].id;

// Stream one track at a time. Music never participates in the game's narration queue.
export class MusicPlayer {
    constructor({ createAudio = () => new Audio(), notify = () => {}, schedule = setTimeout, cancel = clearTimeout } = {}) {
        this.createAudio = createAudio; this.notify = notify; this.schedule = schedule; this.cancel = cancel;
        this.config = {}; this.hidden = false; this.ducked = false; this.revision = 0;
        this.context = null; this.channel = null; this.retiring = new Set(); this.status = 'idle';
    }
    publish(status) { this.status = status; this.notify({ status, track: musicTrack(this.config.bgmTrack).id }); }
    get playingAllowed() { return !!this.config.bgm && !this.hidden; }
    gainTarget() { return Math.max(0, Math.min(100, Number(this.config.bgmVolume) || 0)) / 100 * (this.ducked ? .23 : 1); }
    ramp(channel, value, seconds = .5) {
        const gain = channel.gain.gain, now = this.context.currentTime;
        gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); gain.linearRampToValueAtTime(value, now + seconds);
    }
    configure(config) {
        this.config = { bgm: true, bgmTrack: 'serene', bgmVolume: 28, ...config };
        if (!this.context) return;
        if (!this.playingAllowed) {
            this.revision++; this.channel?.audio.pause(); this.cancel(this.channel?.loadingTimer);
            for (const channel of this.retiring) this.dispose(channel);
            this.publish(this.hidden && this.config.bgm ? 'background' : 'paused');
            return;
        }
        const track = musicTrack(this.config.bgmTrack);
        if (!this.channel || this.channel.id !== track.id || this.status === 'error') this.switchTrack(track);
        else if (this.channel.audio.paused) this.play(this.channel);
        else this.ramp(this.channel, this.gainTarget());
    }
    start(context, config) { if (!context) return; this.context = context; this.configure(config); }
    setHidden(hidden) { this.hidden = hidden; this.configure(this.config); }
    duck(value) { this.ducked = value; if (this.channel && this.context) this.ramp(this.channel, this.gainTarget(), value ? .12 : .8); }
    switchTrack(track) {
        const old = this.channel, audio = this.createAudio();
        audio.preload = 'auto'; audio.loop = true; audio.src = assetUrl(`assets/music/${track.id}.mp3`);
        const source = this.context.createMediaElementSource(audio), gain = this.context.createGain();
        gain.gain.value = 0; source.connect(gain).connect(this.context.destination);
        const channel = { id: track.id, audio, source, gain, timer: null, loadingTimer: null };
        this.channel = channel;
        audio.onerror = () => { if (this.channel === channel) { this.revision++; this.cancel(channel.loadingTimer); audio.pause(); this.publish('error'); } };
        if (old) {
            this.retiring.add(old); this.ramp(old, 0, .35);
            old.timer = this.schedule(() => this.dispose(old), 400);
        }
        this.play(channel);
    }
    async play(channel) {
        const revision = ++this.revision;
        this.cancel(channel.loadingTimer);
        const timeout = this.schedule(() => {
            if (revision !== this.revision || channel !== this.channel) return;
            this.revision++; this.dispose(channel); this.channel = null; this.publish('error');
        }, 12000);
        channel.loadingTimer = timeout;
        this.publish('loading');
        try {
            await channel.audio.play();
            if (revision !== this.revision || channel !== this.channel || !this.playingAllowed) {
                if (channel !== this.channel || !this.playingAllowed) channel.audio.pause();
                return;
            }
            this.ramp(channel, this.gainTarget(), .8); this.publish('playing');
        } catch (error) {
            if (revision !== this.revision || channel !== this.channel) return;
            this.publish(error.name === 'NotAllowedError' ? 'blocked' : 'error');
        } finally {
            this.cancel(timeout);
            if (channel.loadingTimer === timeout) channel.loadingTimer = null;
        }
    }
    dispose(channel) {
        this.cancel(channel.timer); this.cancel(channel.loadingTimer); channel.audio.onerror = null; channel.audio.pause();
        channel.audio.removeAttribute('src'); channel.audio.load(); channel.source.disconnect(); channel.gain.disconnect(); this.retiring.delete(channel);
    }
    stop() {
        this.revision++;
        if (this.channel) this.dispose(this.channel);
        this.channel = null;
        for (const channel of this.retiring) this.dispose(channel);
        this.context = null; this.ducked = false; this.publish('idle');
    }
}
