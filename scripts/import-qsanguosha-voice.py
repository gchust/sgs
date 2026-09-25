"""Import unmodified QSanguosha OGG recordings from pinned source revisions.

Run with python3; no speech service, audio converter, or API key is required.
Existing files are checked against committed hashes; --verify works offline.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
VOICE = ROOT / 'public/assets/voice'
REPO = 'https://github.com/Mogara/QSanguosha'
CURRENT = '85baa7489157c023bb2528a40ce4ef4e12863387'
# These five recordings were removed when upstream switched to the hegemony set.
LEGACY = 'aaf2ef365c6a0a0d0932a4e0506d09342835e202'
LEGACY_SKILLS = {'guhuo', 'lianying', 'hongyan'}
SKILLS = dict(zip(
    '武圣 仁德 咆哮 龙胆 铁骑 观星 空城 集智 奸雄 反馈 鬼才 刚烈 突袭 裸衣 天妒 遗计 倾国 洛神 制衡 奇袭 克己 苦肉 英姿 反间 国色 流离 谦逊 连营 结姻 枭姬 急救 青囊 无双 离间 闭月 神速 据守 烈弓 狂骨 红颜 天香 不屈 雷击 鬼道 蛊惑 强袭 猛进 天义 乱击 祸首 再起 巨象 烈刃'.split(),
    'wusheng rende paoxiao longdan tieqi guanxing kongcheng jizhi jianxiong fankui guicai ganglie tuxi luoyi tiandu yiji qingguo luoshen zhiheng qixi keji kurou yingzi_zhouyu fanjian guose liuli qianxun lianying jieyin xiaoji jijiu qingnang wushuang lijian biyue shensu jushou liegong kuanggu hongyan tianxiang buqu leiji guidao guhuo qiangxi mengjin tianyi luanji huoshou zaiqi juxiang lieren'.split(),
))
MISSING = {'马术': '所选源版本没有马术独立录音，保留游戏音效。',
           '奇才': '所选源版本没有奇才独立录音，保留游戏音效。'}
CARDS = dict(zip(
    '杀 闪 桃 无中生有 过河拆桥 顺手牵羊 决斗 南蛮入侵 万箭齐发 桃园结义 五谷丰登 无懈可击 乐不思蜀 闪电'.split(),
    'slash jink peach ex_nihilo dismantlement snatch duel savage_assault archery_attack god_salvation amazing_grace nullification indulgence lightning'.split(),
))
TRANSCRIPTS = {
    CURRENT: [f'lang/zh_CN/Audio/Standard{faction}Lines.lua' for faction in ['Wei', 'Shu', 'Wu', 'Qun']],
    LEGACY: ['lang/zh_CN/Audio/StandardGeneralPackageLines.lua', 'lang/zh_CN/Audio/WindPackageLines.lua'],
}

def fetch(revision, path):
    url = f'https://raw.githubusercontent.com/Mogara/QSanguosha/{revision}/{quote(path)}'
    for attempt in range(3):
        try:
            with urlopen(url, timeout=30) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def all_clips(catalog, narration):
    return [clip for profile in catalog['characters'].values()
            for variants in profile['skills'].values() for clip in variants] + [
            clip for variants in narration.values() for clip in variants.values()]

def verify(clip, data):
    if not data.startswith(b'OggS') or len(data) < 1000:
        raise ValueError(f'Invalid OGG: {clip["file"]}')
    if clip.get('sha256') and digest(data) != clip['sha256']:
        raise ValueError(f'Hash mismatch: {clip["file"]}')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true', help='Verify all committed audio bytes offline')
    args = parser.parse_args()
    catalog_path, narration_path = VOICE / 'characters.json', VOICE / 'manifest.json'
    old_catalog = json.loads(catalog_path.read_text())
    old_narration = json.loads(narration_path.read_text())
    if args.verify:
        if old_catalog.get('provider') != 'Mogara/QSanguosha':
            raise ValueError('QSanguosha catalog has not been imported')
        clips = all_clips(old_catalog, old_narration)
        for clip in clips:
            verify(clip, (VOICE / clip['file']).read_bytes())
        print(f'Verified {len(clips)} original OGG recordings')
        return
    old_hashes = {c['file']: c['sha256'] for c in all_clips(old_catalog, old_narration)} if old_catalog.get('version') == 3 else {}
    heroes = json.loads(subprocess.check_output([
        'node', '--input-type=module', '-e',
        "import {HEROES} from './lib/game/data.js'; console.log(JSON.stringify(HEROES));",
    ], cwd=ROOT))
    lines = {}
    transcript_jobs = [(rev, path) for rev, paths in TRANSCRIPTS.items() for path in paths]
    def load_transcript(job):
        rev, path = job
        return rev, path, fetch(rev, path)
    with ThreadPoolExecutor(max_workers=6) as pool:
        transcripts = list(pool.map(load_transcript, transcript_jobs))
    for rev, path, data in transcripts:
        for key, text in re.findall(r'[$]([^"]+)"][ ]*=[ ]*"([^"]*)"', data.decode('utf-8-sig')):
            lines[rev, key] = (text, path)
    def clip(rev, path, text, transcript=None):
        record = {'file': f'qsanguosha/{rev[:12]}/{path.removeprefix("audio/")}',
                  'text': text, 'source': {'revision': rev, 'path': path}}
        if transcript:
            record['source']['transcript'] = transcript
        if record['file'] in old_hashes:
            record['sha256'] = old_hashes[record['file']]
        return record
    catalog = {
        'version': 3, 'provider': 'Mogara/QSanguosha',
        'source': {'repository': REPO, 'revision': CURRENT, 'historicalRevision': LEGACY,
                   'license': 'CC-BY-NC-ND-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
                   'credits': 'qsanguosha/CREDITS.md'},
        'description': 'QSanguosha 原始技能录音；原文件字节保留，本站直接播放，不调用合成语音服务。',
        'characters': {},
    }
    for hero in heroes:
        profile = {'name': hero['name'], 'skills': {}, 'unavailable': {}}
        for skill in hero['skill'].split(' · '):
            if skill in MISSING:
                profile['unavailable'][skill] = MISSING[skill]
                continue
            prefix = SKILLS[skill]
            rev = LEGACY if prefix in LEGACY_SKILLS else CURRENT
            keys = [prefix] if prefix == 'hongyan' else [prefix + '1', prefix + '2']
            variants = []
            for key in keys:
                text, transcript = lines[rev, key]
                variants.append(clip(rev, f'audio/skill/{key}.ogg', text, transcript))
            profile['skills'][skill] = variants
        catalog['characters'][hero['id']] = profile
    narration = {word: {sex: clip(CURRENT, f'audio/card/{sex}/{key}.ogg', word)
                        for sex in ['male', 'female']} for word, key in CARDS.items()}
    clips = all_clips(catalog, narration)
    # Finish and validate every download before replacing catalogs or existing assets.
    with tempfile.TemporaryDirectory(prefix='sgs-qsanguosha-') as temporary:
        staging = Path(temporary)
        def download(record):
            target = VOICE / record['file']
            data = target.read_bytes() if target.exists() else fetch(record['source']['revision'], record['source']['path'])
            verify(record, data)
            record['sha256'] = digest(data)
            staged = staging / record['file']
            staged.parent.mkdir(parents=True, exist_ok=True)
            staged.write_bytes(data)
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(download, clips))
        license_bytes = fetch(CURRENT, 'CC BY-NC-ND 4.0')
        readme_bytes = fetch(CURRENT, 'README.md')
        for record in clips:
            target = VOICE / record['file']
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((staging / record['file']).read_bytes())
        source_dir = VOICE / 'qsanguosha'
        (source_dir / 'LICENSE.txt').write_bytes(license_bytes)
        (source_dir / 'UPSTREAM-README.md').write_bytes(readme_bytes)
        for rev, path, data in transcripts:
            target = source_dir / 'transcripts' / rev[:12] / Path(path).name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
        narration_path.write_text(json.dumps(narration, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {len(clips)} original OGG recordings for {len(heroes)} characters')

if __name__ == '__main__':
    main()
