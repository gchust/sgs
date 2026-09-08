"""Generate the checked-in neural narration pack. Requires edge-tts 7.2.8 and ffmpeg.
Runtime playback uses these local files and makes no requests to the TTS service.
"""
import asyncio
import json
import os
import ssl
import subprocess
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
    clips = json.loads((VOICE / 'manifest.json').read_text())
    semaphore = asyncio.Semaphore(4)
    async def generate(word, clip):
        destination = VOICE / (clip['file'] + '.mp3')
        if destination.exists() and destination.stat().st_size > 500:
            return
        async with semaphore:
            raw = destination.with_suffix('.raw.mp3')
            await edge_tts.Communicate(clip['text'], 'zh-CN-YunxiNeural', rate='-8%', pitch='-8Hz',
                proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy'),
                connect_timeout=15, receive_timeout=30).save(str(raw))
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af',
                'silenceremove=start_periods=1:start_threshold=-48dB,loudnorm=I=-18:TP=-2:LRA=7',
                '-ar','24000','-b:a','64k',str(destination)],check=True)
            raw.unlink()
            print(word, flush=True)
    await asyncio.gather(*(generate(word, clip) for word, clip in clips.items()))
    print(f'{len(clips)} normalized voice clips ready', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
