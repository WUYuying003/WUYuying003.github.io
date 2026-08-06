import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>好运钱庄｜翻牌收集游戏<\/title>/i);
  assert.match(html, /aria-label="好运钱庄翻牌游戏"/);
  assert.match(html, />100KB</);
  assert.match(html, />1KB</);
  assert.match(html, />600金币</);
  assert.equal((html.match(/class="flip-card/g) ?? []).length, 12);
});

test("keeps the PRD chance, random draw, surplus, and sound rules", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /DAILY_FREE_CHANCES = 3/);
  assert.match(page, /MAX_CHANCES = 10/);
  assert.match(page, /value >= 8 \? MAX_CHANCES/);
  assert.match(page, /localStorage\.removeItem\(DAILY_STORAGE_KEY\)/);
  assert.match(page, /localStorage\.removeItem\(DAILY_CLAIM_STORAGE_KEY\)/);
  assert.match(page, /jade: remaining\.jade > 0 \? 1 : 0/);
  assert.match(page, /dailySurplus < 5000 \? "coin" : dailySurplus < 500000 \? "ingot" : "jade"/);
  assert.match(page, /setChances\(\(value\) => Math\.min\(MAX_CHANCES, value \+ 1\)\)/);
  assert.match(page, /setChances\(\(value\) => Math\.max\(0, value - 1\)\)/);
  assert.match(page, /DECK_COPIES_PER_SYMBOL - revealedCounts\[symbol\]/);
  assert.match(page, /symbol === "jade" \? "flip-jade\.mp3"/);
  assert.match(page, /nextCount < 4 \|\| symbol === "jade"/);
  assert.match(page, /symbol === "jade",/);
  assert.match(page, /if \(symbol !== "jade"\)/);
  assert.match(page, /DUCKED_BGM_VOLUME = 0\.06/);
  assert.match(page, /flipSoundRef\.current\?\.pause\(\)/);
  assert.match(page, /symbol === "ingot" \? "reward-1k\.wav" : "reward-600\.mp3"/);
  await access(new URL("../public/assets/game/audio/flip-jade.mp3", import.meta.url));
});
