import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');

test('static entry loads its JS, stylesheet and icon from root and subdirectory hosting', async () => {
  const html = await readFile(path.join(dist, 'index.html'), 'utf8');
  assert.match(html, /lang="zh-CN"/);
  assert.match(html, /萌将三国/);
  assert.match(html, /id="root"/);
  assert.match(html, /type="module"/);
  assert.doesNotMatch(html, /_next|_vinext|\/app\/main/);
  for (const base of ['https://example.test/', 'https://example.test/sgs/']) {
    for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = new URL(reference, base);
      assert(url.href.startsWith(base), `${reference} escaped ${base}`);
      await access(path.join(dist, decodeURIComponent(url.href.slice(base.length))));
    }
  }
  await assert.rejects(access(path.join(dist, 'server')));
});

test('all public resources are copied unchanged and CSS image references stay inside the deployment', async () => {
  async function verify(directory, relative = '') {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(relative, item.name);
      if (item.isDirectory()) await verify(path.join(directory, item.name), file);
      else assert.deepEqual(await readFile(path.join(dist, file)), await readFile(path.join(directory, item.name)), file);
    }
  }
  await verify(path.join(root, 'public'));
  const cssFiles = (await readdir(path.join(dist, 'assets'))).filter(file => file.endsWith('.css'));
  assert(cssFiles.length > 0);
  for (const file of cssFiles) {
    const css = await readFile(path.join(dist, 'assets', file), 'utf8');
    for (const [, reference] of css.matchAll(/url\(["']?([^\s"')]+)["']?\)/g)) {
      if (/^(data:|https?:|#)/.test(reference)) continue;
      for (const base of ['https://example.test/', 'https://example.test/sgs/']) {
        const url = new URL(reference, `${base}assets/${file}`);
        assert(url.href.startsWith(base), `${reference} escaped ${base}`);
        await access(path.join(dist, decodeURIComponent(url.href.slice(base.length))));
      }
    }
  }
});

test('Vite compiles runtime portrait and audio paths for relocatable static hosting', async () => {
  const result = await build({ configFile: false, root, base: './', logLevel: 'silent', build: {
    write: false, minify: false,
    lib: { entry: path.join(root, 'lib/game/assets.js'), formats: ['es'], fileName: 'assets' },
  } });
  const output = Array.isArray(result) ? result[0].output : result.output;
  const chunk = output.find(item => item.type === 'chunk');
  const { assetUrl } = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
  for (const prefix of ['/', '/sgs/']) for (const file of ['assets/portraits.png', 'assets/voice/qsanguosha/85baa7489157/card/male/slash.ogg', 'assets/music/serene.mp3']) {
    assert.equal(new URL(assetUrl(file), `https://example.test${prefix}`).pathname, prefix + file);
  }
});
