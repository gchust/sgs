"""Generate the checked-in neural narration pack. Requires edge-tts 7.2.8 and ffmpeg.
Runtime playback uses these local files and makes no requests to the TTS service.
"""
import argparse
import asyncio
import hashlib
import json
import os
import shutil
import ssl
import subprocess
import tempfile
from pathlib import Path
import edge_tts
import edge_tts.communicate

ROOT = Path(__file__).resolve().parents[1]
VOICE = ROOT / 'public/assets/voice'
# Use the machine's trusted CA bundle in environments with a managed HTTPS proxy.
ca = os.environ.get('SSL_CERT_FILE') or ssl.get_default_verify_paths().cafile
if ca:
    edge_tts.communicate._SSL_CTX.load_verify_locations(ca)

async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--characters-only', action='store_true')
    parser.add_argument('--hero', help='Generate one character, for example guanyu')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    catalog_path = VOICE / 'characters.json'
    catalog = json.loads(catalog_path.read_text())
    if args.hero and args.hero not in catalog['characters']:
        parser.error(f'Unknown character: {args.hero}')
    jobs = []
    if not args.characters_only and not args.hero:
        clips = json.loads((VOICE / 'manifest.json').read_text())
        jobs.extend((word, clip, {'voice': 'zh-CN-YunxiNeural', 'rate': '-8%', 'pitch': '-8Hz'})
                    for word, clip in clips.items())
    for hero, profile in catalog['characters'].items():
        if args.hero and hero != args.hero:
            continue
        for skill_index, (skill, variants) in enumerate(profile['skills'].items()):
            for i, clip in enumerate(variants):
                fingerprint = hashlib.sha256(json.dumps(
                    [clip['text'], profile['voice'], profile['rate'], profile['pitch']],
                    ensure_ascii=False).encode()).hexdigest()[:10]
                clip['file'] = f'characters/{hero}-{skill_index}-{i}-{fingerprint}'
            jobs.extend((f'{profile["name"]} · {skill} · {i + 1}', clip, profile)
                        for i, clip in enumerate(variants))
    semaphore = asyncio.Semaphore(4)
    async def generate(word, clip, profile):
        destination = VOICE / (clip['file'] + '.mp3')
        if not args.force and destination.exists() and destination.stat().st_size > 500:
            clip['sha256'] = hashlib.sha256(destination.read_bytes()).hexdigest()
            return
        async with semaphore:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='sgs-voice-') as temporary:
                raw = Path(temporary) / 'raw.mp3'
                normalized = Path(temporary) / 'normalized.mp3'
                for attempt in range(3):
                    try:
                        await edge_tts.Communicate(clip['text'], profile['voice'],
                            rate=profile['rate'], pitch=profile['pitch'],
                            proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy'),
                            connect_timeout=15, receive_timeout=30).save(str(raw))
                        break
                    except Exception:
                        if attempt == 2:
                            raise
                        await asyncio.sleep(2 ** attempt)
                await asyncio.to_thread(subprocess.run, [ffmpeg, '-v', 'error', '-y', '-i', str(raw), '-af',
                    'silenceremove=start_periods=1:start_threshold=-48dB,loudnorm=I=-18:TP=-2:LRA=7',
                    '-ar', '24000', '-b:a', '80k', str(normalized)], check=True)
                destination.write_bytes(normalized.read_bytes())
            clip['sha256'] = hashlib.sha256(destination.read_bytes()).hexdigest()
            print(word, flush=True)
    await asyncio.gather(*(generate(*job) for job in jobs))
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(jobs)} normalized voice clips ready', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
