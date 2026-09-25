import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});


test("national hidden portraits and equipment labels do not expose unrevealed names", async () => {
  const { GeneralPortrait } = await vite.ssrLoadModule("/app/mode-ui.jsx");
  const { Equipment } = await vite.ssrLoadModule("/app/battle-ui.jsx");
  const { Game } = await vite.ssrLoadModule("/lib/game/engine.js");
  const g = new Game('guanyu', 'normal', {}, 4, { mode: 'national', deputy: 'zhangfei' });
  const player = g.players[0];
  const render = props => renderToStaticMarkup(React.createElement(GeneralPortrait, { player, ...props }));
  const hidden = render({});
  assert.doesNotMatch(hidden, /关羽|张飞|portraits/);
  assert.match(hidden, /主将未亮出/); assert.match(hidden, /副将未亮出/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Equipment, { player })), /关羽|张飞/);
  const own = render({ own: true }); assert.match(own, /关羽/); assert.match(own, /张飞/);
  g.reveal(0, 1);
  assert.match(render({}), /张飞/); assert.doesNotMatch(render({}), /关羽/);
  assert.match(render({ ended: true }), /关羽/);
});

test("recent play history retains eight individual cards in chronological order", async () => {
  const { ActionStage } = await vite.ssrLoadModule("/app/battle-ui.jsx");
  const cards = Array.from({ length: 12 }, (_, i) => ({
    seq: i + 1, type: 'sha', suit: '♠', rank: '7', by: `出牌者${i + 1}`,
    actor: 0, destination: '对手', kind: 'card',
  }));
  const Card = ({ card }) => React.createElement('button', { 'data-sequence': card.seq }, `卡牌${card.seq}`);
  const html = renderToStaticMarkup(React.createElement(ActionStage, { cards, entries: [], Card, onInspect() {} }));
  assert.deepEqual([...html.matchAll(/data-sequence="(\d+)"/g)].map(m => Number(m[1])), [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.match(html, /最近8张出牌，按时间顺序排列/);
  assert.match(html, /出牌者12/);
  const empty = renderToStaticMarkup(React.createElement(ActionStage, { cards: [], entries: [], Card }));
  assert.match(empty, /等待第一张出牌/);
});
