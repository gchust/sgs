#!/usr/bin/env python3
"""Rebuild the credited local BGM assets with Python 3 and FFmpeg."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/music'
TRACKS = json.loads((ASSETS / 'sources.json').read_text())

with tempfile.TemporaryDirectory(prefix='mengjiang-music-') as temporary:
    for track in TRACKS:
        original = Path(temporary) / (track['id'] + '.mp3')
        with urlopen(track['download'], timeout=60) as response:
            original.write_bytes(response.read())
        if hashlib.sha256(original.read_bytes()).hexdigest() != track['originalSha256']:
            raise RuntimeError(f"Source changed for {track['title']}; verify the new source before processing.")
        subprocess.run([
            'ffmpeg', '-v', 'error', '-y', '-i', str(original), '-vn',
            '-af', 'loudnorm=I=-21:TP=-2:LRA=11', '-ar', '44100', '-ac', '2',
            '-c:a', 'libmp3lame', '-b:a', '160k', '-map_metadata', '-1',
            '-metadata', 'title=' + track['title'], '-metadata', 'artist=' + track['artist'],
            '-metadata', 'copyright=CC BY 4.0 https://creativecommons.org/licenses/by/4.0/',
            str(ASSETS / (track['id'] + '.mp3')),
        ], check=True)
        print('Prepared', track['title'])
