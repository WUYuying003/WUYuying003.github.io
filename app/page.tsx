"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type SymbolKey = "jade" | "ingot" | "coin";
type Card = { id: number; symbol: SymbolKey | null; reward: number | null; rewardClaimed: boolean };
type Overlay = "none" | "adPrompt" | "celebration" | "settled" | "rules" | "dailyGift" | "guaranteedIngot" | "jackpotBoard";
type AdAction = "flip" | "addChance" | "reward";
type JackpotRecord = { name: string; time: string };
type FinalCardState = "winner" | "opened" | "unopened";
type FlyAnimation = {
  id: number;
  symbol: SymbolKey;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

const SYMBOLS: Record<SymbolKey, { name: string; reward: string }> = {
  jade: { name: "玉如意", reward: "100KB" },
  ingot: { name: "金元宝", reward: "1KB" },
  coin: { name: "方孔金币", reward: "600金币" },
};

const DECK_COPIES_PER_SYMBOL = 4;
const DAILY_FREE_CHANCES = 3;
const MAX_CHANCES = 10;
const DEFAULT_AD_REVENUE = 800;
const DAILY_STORAGE_KEY = "good-luck-bank-daily-v2";
const DAILY_CLAIM_STORAGE_KEY = "good-luck-bank-claimed-date-v1";
const JACKPOT_RECORDS_STORAGE_KEY = "good-luck-bank-jackpot-records-v1";
const REWARD_CARD_COINS = 200;
const REWARD_VALUES: Record<SymbolKey, number> = { jade: 100000, ingot: 1000, coin: 600 };
const DEFAULT_JACKPOT_RECORDS: JackpotRecord[] = [
  { name: "全***", time: "今天15:32" },
  { name: "梦***", time: "今天12:18" },
  { name: "歌***", time: "今天09:46" },
];
const BGM_VOLUME = 0.28;
const DUCKED_BGM_VOLUME = 0.06;
const WINNER_ROW_DURATION_MS = 3200;
const CELEBRATION_DURATION_MS = 1000;

function SymbolIcon({ kind, small = false }: { kind: SymbolKey; small?: boolean }) {
  const files: Record<SymbolKey, string> = small
    ? { jade: "jade-small.png", ingot: "ingot-small.png", coin: "progress-coin.png" }
    : { jade: "jade-large.png", ingot: "ingot-large.png", coin: "coin-large.png" };
  return <img className={`symbol symbol-${kind} ${small ? "symbol-small" : ""}`} src={`/assets/game/${files[kind]}`} alt={SYMBOLS[kind].name} />;
}

function blankCards(): Card[] {
  return Array.from({ length: 12 }, (_, id) => ({ id, symbol: null, reward: null, rewardClaimed: false }));
}

function todayKey() {
  return new Date().toLocaleDateString("sv-SE");
}

function secureRandom() {
  const value = new Uint32Array(1);
  window.crypto.getRandomValues(value);
  return value[0] / 0x100000000;
}

function buildFinalCards(cards: Card[], winner: SymbolKey): Array<{ id: number; symbol: SymbolKey; state: FinalCardState }> {
  const symbols: SymbolKey[] = ["jade", "ingot", "coin"];
  const revealedCounts: Record<SymbolKey, number> = { jade: 0, ingot: 0, coin: 0 };
  cards.forEach((card) => {
    if (card.symbol) revealedCounts[card.symbol] += 1;
  });
  const hiddenSymbols = symbols.flatMap((symbol) =>
    Array.from(
      { length: Math.max(0, DECK_COPIES_PER_SYMBOL - revealedCounts[symbol]) },
      () => symbol,
    ),
  );
  let hiddenIndex = 0;

  return cards.map((card) => {
    if (card.symbol === winner) return { id: card.id, symbol: winner, state: "winner" };
    if (card.symbol) return { id: card.id, symbol: card.symbol, state: "opened" };
    return {
      id: card.id,
      symbol: hiddenSymbols[hiddenIndex++],
      state: "unopened",
    };
  });
}

function FinalCardGrid({ cards, winner, dimmed = false }: { cards: Card[]; winner: SymbolKey; dimmed?: boolean }) {
  const finalCards = buildFinalCards(cards, winner);
  return (
    <div className={`final-card-grid ${dimmed ? "is-dimmed" : ""}`} aria-hidden="true">
      {finalCards.map((card) => (
        <span
          className={`final-card is-${card.state}`}
          key={card.id}
        >
          {card.state === "winner" ? (
            <SymbolIcon kind={card.symbol} />
          ) : (
            <img
              className="final-card-art"
              src={`/assets/game/result-cards/${card.state}-${card.symbol}.png`}
              alt=""
            />
          )}
        </span>
      ))}
    </div>
  );
}

export default function Home({ hideEnergy = false }: { hideEnergy?: boolean }) {
  const [cards, setCards] = useState<Card[]>(blankCards);
  const [counts, setCounts] = useState<Record<SymbolKey, number>>({ jade: 0, ingot: 0, coin: 0 });
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [pendingCard, setPendingCard] = useState<number | null>(null);
  const [winner, setWinner] = useState<SymbolKey | null>(null);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [chances, setChances] = useState(0);
  const [dailyAdRevenue, setDailyAdRevenue] = useState(0);
  const [dailyRewardCost, setDailyRewardCost] = useState(0);
  const [adAction, setAdAction] = useState<AdAction>("flip");
  const [adRevenueNext, setAdRevenueNext] = useState(DEFAULT_AD_REVENUE);
  const [dailyReady, setDailyReady] = useState(false);
  const [jackpotRecords, setJackpotRecords] = useState<JackpotRecord[]>(DEFAULT_JACKPOT_RECORDS);
  const [adRequests, setAdRequests] = useState(0);
  const [adSuccess, setAdSuccess] = useState(0);
  const [failNext, setFailNext] = useState(false);
  const [nextSymbol, setNextSymbol] = useState<"random" | SymbolKey>("random");
  const [debugOpen, setDebugOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [toastId, setToastId] = useState(0);
  const [flyAnimation, setFlyAnimation] = useState<FlyAnimation | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const flipSoundRef = useRef<HTMLAudioElement | null>(null);
  const rewardSoundRef = useRef<HTMLAudioElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const settlementTimerRef = useRef<number | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
  const flyIdRef = useRef(0);
  const drawHistoryRef = useRef<SymbolKey[]>([]);

  const flips = useMemo(() => cards.filter((card) => card.symbol).length, [cards]);
  const dailySurplus = dailyAdRevenue - dailyRewardCost;

  useEffect(() => {
    bgmRef.current = new Audio("/assets/game/audio/game-bgm.mp3");
    bgmRef.current.loop = true;
    bgmRef.current.volume = BGM_VOLUME;
    return () => {
      bgmRef.current?.pause();
      flipSoundRef.current?.pause();
      rewardSoundRef.current?.pause();
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (settlementTimerRef.current !== null) window.clearTimeout(settlementTimerRef.current);
      if (celebrationTimerRef.current !== null) window.clearTimeout(celebrationTimerRef.current);
    };
  }, []);


  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) || "null") as null | {
        date: string; chances: number; adRevenue: number; rewardCost: number;
      };
      const date = todayKey();
      if (!saved) {
        setChances(hideEnergy ? DAILY_FREE_CHANCES : 0);
      } else if (saved.date === date) {
        setChances(Math.min(MAX_CHANCES, Math.max(0, saved.chances)));
        setDailyAdRevenue(Math.max(0, saved.adRevenue || 0));
        setDailyRewardCost(Math.max(0, saved.rewardCost || 0));
      } else {
        const carried = Math.min(MAX_CHANCES, Math.max(0, saved.chances));
        setChances(hideEnergy ? (carried >= 8 ? MAX_CHANCES : Math.min(MAX_CHANCES, carried + DAILY_FREE_CHANCES)) : carried);
        setDailyAdRevenue(0);
        setDailyRewardCost(0);
      }
      if (hideEnergy) {
        localStorage.setItem(DAILY_CLAIM_STORAGE_KEY, date);
      } else if (localStorage.getItem(DAILY_CLAIM_STORAGE_KEY) !== date) {
        setOverlay("dailyGift");
      }
    } catch {
      setChances(hideEnergy ? DAILY_FREE_CHANCES : 0);
      if (hideEnergy) localStorage.setItem(DAILY_CLAIM_STORAGE_KEY, todayKey());
      else setOverlay("dailyGift");
    }
    setDailyReady(true);
    try {
      const savedRecords = JSON.parse(localStorage.getItem(JACKPOT_RECORDS_STORAGE_KEY) || "null") as JackpotRecord[] | null;
      if (savedRecords?.length) setJackpotRecords(savedRecords.slice(0, 5));
    } catch {
      setJackpotRecords(DEFAULT_JACKPOT_RECORDS);
    }
  }, [hideEnergy]);

  useEffect(() => {
    if (!dailyReady) return;
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify({
      date: todayKey(), chances, adRevenue: dailyAdRevenue, rewardCost: dailyRewardCost,
    }));
  }, [chances, dailyAdRevenue, dailyRewardCost, dailyReady]);

  function unlockBgm() {
    if (bgmRef.current?.paused) void bgmRef.current.play().catch(() => undefined);
  }

  function stopFlipSound() {
    flipSoundRef.current?.pause();
    flipSoundRef.current = null;
    if (bgmRef.current) bgmRef.current.volume = BGM_VOLUME;
  }

  function playSound(file: string, volume = 0.86, duckBgm = false) {
    stopFlipSound();
    const sound = new Audio(`/assets/game/audio/${file}`);
    sound.volume = volume;
    flipSoundRef.current = sound;
    if (duckBgm && bgmRef.current) bgmRef.current.volume = DUCKED_BGM_VOLUME;
    const finish = () => {
      if (flipSoundRef.current === sound) flipSoundRef.current = null;
      if (duckBgm && bgmRef.current) bgmRef.current.volume = BGM_VOLUME;
    };
    sound.addEventListener("ended", finish, { once: true });
    void sound.play().catch(finish);
  }

  function stopRewardSound() {
    if (!rewardSoundRef.current) return;
    rewardSoundRef.current.pause();
    rewardSoundRef.current.currentTime = 0;
    rewardSoundRef.current = null;
  }

  function playRewardSound(file: string) {
    stopRewardSound();
    const sound = new Audio(`/assets/game/audio/${file}`);
    sound.loop = true;
    sound.volume = 1;
    rewardSoundRef.current = sound;
    void sound.play().catch(() => undefined);
  }

  function showToast(message: string) {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    setToastId((value) => value + 1);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 5000);
  }

  function chooseSymbol(effectiveSurplus = dailySurplus): SymbolKey {
    if (nextSymbol !== "random") {
      const chosen = nextSymbol;
      setNextSymbol("random");
      return chosen;
    }
    const remaining = {
      jade: DECK_COPIES_PER_SYMBOL - counts.jade,
      ingot: DECK_COPIES_PER_SYMBOL - counts.ingot,
      coin: DECK_COPIES_PER_SYMBOL - counts.coin,
    };
    const symbols: SymbolKey[] = ["jade", "ingot", "coin"];
    const target: SymbolKey = effectiveSurplus < 5000 ? "coin" : effectiveSurplus < 500000 ? "ingot" : "jade";
    const capped = symbols.filter((symbol) => counts[symbol] >= 3 && remaining[symbol] > 0);
    if (capped.length) {
      if (capped.includes(target)) return target;
      const alternatives = symbols.filter((symbol) => remaining[symbol] > 0 && !capped.includes(symbol));
      return alternatives[Math.floor(secureRandom() * alternatives.length)] || target;
    }
    const weights: Record<SymbolKey, number> = {
      jade: remaining.jade > 0 ? 1 : 0,
      ingot: remaining.ingot > 0 ? 1 : 0,
      coin: remaining.coin > 0 ? 1 : 0,
    };
    const totalWeight = weights.jade + weights.ingot + weights.coin;
    const value = secureRandom() * totalWeight;
    if (value < weights.jade) return "jade";
    if (value < weights.jade + weights.ingot) return "ingot";
    return "coin";
  }

  function clickCard(id: number) {
    if (overlay !== "none" || winner || cards[id].symbol || cards[id].rewardClaimed) return;
    unlockBgm();
    if (cards[id].reward) {
      setPendingCard(id);
      setAdAction("reward");
      setOverlay("adPrompt");
      return;
    }
    if (chances >= 1) {
      setChances((value) => Math.max(0, value - 1));
      revealCard(id);
      return;
    }
    setPendingCard(id);
    setAdAction("flip");
    setOverlay("adPrompt");
  }

  function requestAddChance() {
    if (chances >= MAX_CHANCES || overlay !== "none" || winner) return;
    unlockBgm();
    setPendingCard(null);
    setAdAction("addChance");
    setAdRequests((value) => value + 1);
    if (failNext) {
      setFailNext(false);
      showToast("广告播放失败，次数未增加，请重试");
      return;
    }
    setAdSuccess((value) => value + 1);
    setDailyAdRevenue((value) => value + adRevenueNext);
    setChances((value) => Math.min(MAX_CHANCES, value + 1));
    showToast("广告完成，翻牌次数+1");
  }

  function claimDailyGift() {
    setChances((value) => value >= 8 ? MAX_CHANCES : Math.min(MAX_CHANCES, value + DAILY_FREE_CHANCES));
    localStorage.setItem(DAILY_CLAIM_STORAGE_KEY, todayKey());
    setOverlay("none");
  }

  function enableHighValueDemo() {
    setNextSymbol("ingot");
    setDebugOpen(false);
    setOverlay("guaranteedIngot");
  }

  function startAd() {
    setAdRequests((value) => value + 1);
    if (failNext) {
      setFailNext(false);
      setOverlay("none");
      setPendingCard(null);
      showToast("广告播放失败，卡牌未消耗，请重试");
      return;
    }
    finishAd();
  }

  function finishAd() {
    setAdSuccess((value) => value + 1);
    setDailyAdRevenue((value) => value + adRevenueNext);
    if (adAction === "flip" && pendingCard !== null) {
      revealCard(pendingCard, dailySurplus + adRevenueNext);
    } else if (adAction === "reward" && pendingCard !== null) {
      const rewardCardId = pendingCard;
      setCards((current) => current.map((card) => card.id === rewardCardId ? { ...card, rewardClaimed: true } : card));
      setSessionCoins((value) => value + REWARD_CARD_COINS);
      setDailyRewardCost((value) => value + REWARD_CARD_COINS);
      setPendingCard(null);
      setOverlay("none");
      showToast(`奖励牌已领取${REWARD_CARD_COINS}金币`);
    } else {
      setChances((value) => Math.min(MAX_CHANCES, value + 1));
      setOverlay("none");
      showToast("广告完成，翻牌次数+1");
    }
  }

  function revealCard(cardId: number, effectiveSurplus = dailySurplus) {
    const symbol = chooseSymbol(effectiveSurplus);
    drawHistoryRef.current.push(symbol);
    const nextCount = counts[symbol] + 1;
    const shellRect = shellRef.current?.getBoundingClientRect();
    const cardRect = cardRefs.current[cardId]?.getBoundingClientRect();
    const targetRect = slotRefs.current[`${symbol}-${Math.min(counts[symbol], 3)}`]?.getBoundingClientRect();

    if (shellRect && cardRect && targetRect) {
      flyIdRef.current += 1;
      setFlyAnimation({
        id: flyIdRef.current,
        symbol,
        fromX: cardRect.left + cardRect.width / 2 - shellRect.left,
        fromY: cardRect.top + cardRect.height / 2 - shellRect.top,
        toX: targetRect.left + targetRect.width / 2 - shellRect.left,
        toY: targetRect.top + targetRect.height / 2 - shellRect.top,
      });
      window.setTimeout(() => setFlyAnimation(null), 980);
    }

    if (nextCount < 4 || symbol === "jade") {
      playSound(
        symbol === "jade" ? "flip-jade.mp3" : symbol === "ingot" ? "flip-major.mp3" : "flip-small.mp3",
        symbol === "jade" ? 1 : 0.86,
        symbol === "jade",
      );
    }
    setSessionCoins((value) => value + 50);
    setDailyRewardCost((value) => value + 50);
    setCards((current) => {
      const revealed = current.map((card) => card.id === cardId ? { ...card, symbol } : card);
      const canCreateRewardCard = nextCount === 3
        && effectiveSurplus - 50 - REWARD_VALUES[symbol] > REWARD_CARD_COINS
        && !revealed.some((card) => card.reward !== null);
      if (!canCreateRewardCard) return revealed;
      const candidates = revealed.filter((card) => card.symbol === null && card.reward === null && !card.rewardClaimed);
      if (!candidates.length) return revealed;
      const chosen = candidates[Math.floor(secureRandom() * candidates.length)];
      window.setTimeout(() => showToast(`发现${REWARD_CARD_COINS}金币奖励牌！`), 1100);
      return revealed.map((card) => card.id === chosen.id ? { ...card, reward: REWARD_CARD_COINS } : card);
    });
    setCounts((current) => ({ ...current, [symbol]: nextCount }));
    setPendingCard(null);
    setOverlay("none");
    showToast("获得50金币!");
    if (nextCount >= 4) {
      setWinner(symbol);
      setDailyRewardCost((value) => value + REWARD_VALUES[symbol]);
      if (symbol === "jade") {
        const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
        const record = { name: "全***", time: `今天${time}` };
        setJackpotRecords((current) => {
          const updated = [record, ...current].slice(0, 5);
          localStorage.setItem(JACKPOT_RECORDS_STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
      }
      setDebugOpen(false);
      if (symbol !== "jade") {
        playRewardSound(symbol === "ingot" ? "reward-1k.wav" : "reward-600.mp3");
      }
      settlementTimerRef.current = window.setTimeout(() => {
        settlementTimerRef.current = null;
        if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
        setToast("");
        setOverlay("celebration");
        celebrationTimerRef.current = window.setTimeout(() => {
          celebrationTimerRef.current = null;
          stopRewardSound();
          setOverlay("settled");
        }, CELEBRATION_DURATION_MS);
      }, WINNER_ROW_DURATION_MS);
    }
  }

  function resetGame() {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    if (settlementTimerRef.current !== null) window.clearTimeout(settlementTimerRef.current);
    if (celebrationTimerRef.current !== null) window.clearTimeout(celebrationTimerRef.current);
    toastTimerRef.current = null;
    settlementTimerRef.current = null;
    celebrationTimerRef.current = null;
    stopFlipSound();
    stopRewardSound();
    setCards(blankCards());
    setCounts({ jade: 0, ingot: 0, coin: 0 });
    setOverlay("none");
    setPendingCard(null);
    setWinner(null);
    setSessionCoins(0);
    setAdRequests(0);
    setAdSuccess(0);
    setToast("");
    setFlyAnimation(null);
    drawHistoryRef.current = [];
  }

  function resetAllData() {
    resetGame();
    setChances(0);
    setDailyAdRevenue(0);
    setDailyRewardCost(0);
    setAdRevenueNext(DEFAULT_AD_REVENUE);
    setNextSymbol("random");
    setFailNext(false);
    setDebugOpen(false);
    localStorage.removeItem(DAILY_STORAGE_KEY);
    localStorage.removeItem(DAILY_CLAIM_STORAGE_KEY);
    setOverlay("dailyGift");
  }

  const rows: SymbolKey[] = ["jade", "ingot", "coin"];

  return (
    <main className="stage">
      <section className="phone-shell" ref={shellRef} aria-label="好运钱庄翻牌游戏">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <header className="bank-header">
          <button className="jackpot-ticker" onClick={() => setOverlay("jackpotBoard")} disabled={Boolean(winner)}>
            <b>100K币大奖榜</b><span>恭喜 {jackpotRecords[0].name} 于{jackpotRecords[0].time}获得100K币大奖！</span>
          </button>
          <button className="round-tool rules-tool" onClick={() => setOverlay("rules")} disabled={Boolean(winner)} aria-label="查看规则">?</button>
          <div className="roof roof-left" />
          <div className="roof roof-right" />
          <div className="portrait" aria-hidden="true">♬</div>
          <div className="title-plaque">好运钱庄</div>
          <p>✦ 集齐4个同款，赢取奖励 ✦</p>
          <button className="round-tool debug-tool" onClick={() => setDebugOpen((value) => !value)} disabled={Boolean(winner)} aria-label="打开测试面板">⚙</button>
          {!hideEnergy && (
            <div className="chance-panel" aria-label={`剩余可翻次数${chances}次`}>
              <span>剩余可翻次数 <strong>{chances}</strong><small>/10</small></span>
              <button onClick={requestAddChance} disabled={chances >= MAX_CHANCES || Boolean(winner)}>看广告 +1次</button>
            </div>
          )}
        </header>

        <section className="progress-board" aria-label="奖励进度">
          {rows.map((kind) => (
            <div className={`progress-row ${winner === kind ? "progress-winner" : ""}`} key={kind}>
              <div className="slots">
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    className={`slot ${index < counts[kind] ? "slot-filled" : ""}`}
                    key={index}
                    ref={(node) => { slotRefs.current[`${kind}-${index}`] = node; }}
                  >
                    {index < counts[kind] && <SymbolIcon kind={kind} small />}
                  </div>
                ))}
              </div>
              <div className="reward-card">
                <img className="gift-cube" src="/assets/game/gift-cube.png" alt="" />
                <strong>{SYMBOLS[kind].reward}</strong>
              </div>
            </div>
          ))}
        </section>

        <section className="card-grid" aria-label="幸运卡牌">
          {cards.map((card) => (
            <button
              className={`flip-card ${card.symbol || card.rewardClaimed ? "is-open" : ""} ${card.reward && !card.rewardClaimed ? "is-reward-card" : ""} ${winner && card.symbol === winner ? "winning-card" : ""}`}
              key={card.id}
              ref={(node) => { cardRefs.current[card.id] = node; }}
              onClick={() => clickCard(card.id)}
              disabled={Boolean(card.symbol) || card.rewardClaimed || Boolean(winner) || overlay !== "none"}
              aria-label={card.symbol ? `已翻出${SYMBOLS[card.symbol].name}` : card.reward ? `${REWARD_CARD_COINS}金币奖励牌` : `翻开第${card.id + 1}张卡牌`}
            >
              <span className="card-inner">
                <span className="card-back">{card.reward && !card.rewardClaimed && <span className="reward-card-label"><b>奖励牌</b><strong>{card.reward}</strong><small>金币</small></span>}</span>
                <span className="card-front">
                  {card.symbol && <SymbolIcon kind={card.symbol} />}
                  {card.rewardClaimed && <span className="reward-card-result"><img src="/assets/game/coin-large.png" alt="" /><strong>200</strong><small>金币</small></span>}
                </span>
              </span>
            </button>
          ))}
        </section>

        {debugOpen && (
          <aside className="debug-panel">
            <div className="debug-title"><b>测试控制台</b><button onClick={() => setDebugOpen(false)}>×</button></div>
            <label>指定下一张
              <select value={nextSymbol} onChange={(event) => setNextSymbol(event.target.value as "random" | SymbolKey)}>
                <option value="random">随机</option>
                <option value="jade">玉如意</option>
                <option value="ingot">金元宝</option>
                <option value="coin">方孔金币</option>
              </select>
            </label>
            <label>单条广告收益<input type="number" min="0" value={adRevenueNext} onChange={(event) => setAdRevenueNext(Math.max(0, Number(event.target.value) || 0))} /></label>
            <label>个人奖励池盈余<input type="number" value={dailySurplus} onChange={(event) => setDailyAdRevenue(dailyRewardCost + (Number(event.target.value) || 0))} /></label>
            <button className="debug-highlight" onClick={enableHighValueDemo}>模拟高价值用户</button>
            <button className={failNext ? "debug-danger active" : "debug-danger"} onClick={() => setFailNext(true)}>下一次广告失败</button>
            <button onClick={resetAllData}>重置所有数据</button>
            <div className="debug-stats">
              <span>翻牌 {flips}</span><span>广告 {adSuccess}/{adRequests}</span>
              <span>次数 {chances}/10</span><span>下次 {chances > 0 ? "扣次数" : "需广告"}</span>
              <span>玉 {counts.jade}</span><span>元宝 {counts.ingot}</span><span>铜钱 {counts.coin}</span>
              <span>本局金币 {sessionCoins}</span><span>广告收益 {dailyAdRevenue}</span>
              <span>奖励支出 {dailyRewardCost}</span><span>今日盈余 {dailySurplus}</span>
            </div>
          </aside>
        )}

        {flyAnimation && (
          <div
            className="flying-symbol"
            key={`fly-${flyAnimation.id}`}
            style={{
              "--fly-from-x": `${flyAnimation.fromX}px`,
              "--fly-from-y": `${flyAnimation.fromY}px`,
              "--fly-to-x": `${flyAnimation.toX}px`,
              "--fly-to-y": `${flyAnimation.toY}px`,
            } as CSSProperties}
          >
            <SymbolIcon kind={flyAnimation.symbol} />
          </div>
        )}

        {toast && (toast === "获得50金币!" ? (
          <div className="coin-toast" key={`coin-toast-${toastId}`} role="status" aria-label={toast}>
            <img src="/assets/game/coin-toast-50.png" alt="获得50金币" />
          </div>
        ) : (
          <div className="error-toast" key={`error-toast-${toastId}`} role="status">{toast}</div>
        ))}

        {overlay !== "none" && (
          <div className={`overlay overlay-${overlay}`}>
            {overlay === "adPrompt" && (
              <div className="modal reward-modal">
                <button
                  className="modal-close"
                  onClick={() => { setOverlay("none"); setPendingCard(null); }}
                  aria-label="关闭弹窗，不看广告"
                >
                  <img src="/assets/game/close.png" alt="" />
                </button>
                <div className="coin-stack" />
                <h2>{adAction === "flip" ? <>看广告翻转卡牌<br />并领取50金币！</> : adAction === "reward" ? <>看广告翻开奖励牌<br />领取200金币！</> : <>完整观看广告<br />翻牌次数+1</>}</h2>
                <button className="primary-button image-button" onClick={startAd}>{adAction === "flip" ? <img src="/assets/game/button-text-flip.png" alt="翻转卡牌" /> : adAction === "reward" ? "领取200金币" : "看广告 +1次"}</button>
              </div>
            )}
            {overlay === "settled" && winner && (
              <div className="settlement">
                <img className="confetti-image" src="/assets/game/confetti.png" alt="" />
                <img className="jackpot-title" src="/assets/game/jackpot-title.png" alt="大奖达成，鸿运到账" />
                <FinalCardGrid cards={cards} winner={winner} />
                <div className="ticket">
                  <small>✦ 恭喜获得 ✦</small>
                  <strong>{SYMBOLS[winner].reward}</strong>
                  <button className="primary-button" onClick={resetGame}>领取奖励</button>
                </div>
              </div>
            )}
            {overlay === "celebration" && winner && (
              <div className="celebration-screen">
                <img className="confetti-image" src="/assets/game/confetti.png" alt="" />
                <img className="jackpot-title" src="/assets/game/jackpot-title.png" alt="大奖达成，鸿运到账" />
                <FinalCardGrid cards={cards} winner={winner} dimmed />
                <div className="open-chest">
                  <img src="/assets/game/reward-chest.png" alt="打开的奖励宝箱" />
                </div>
                <div className="ticket">
                  <small>✦ 恭喜获得 ✦</small>
                  <strong>{SYMBOLS[winner].reward}</strong>
                </div>
              </div>
            )}
            {overlay === "rules" && (
              <div className="modal rules-modal">
                <h2>活动规则</h2>
                <ol>
                  {hideEnergy ? (
                    <>
                      <li>每天自动获得3次翻牌机会，每次翻牌消耗1次。</li>
                      <li>次数为0时，点击卡牌完整观看广告后即可继续翻牌。</li>
                    </>
                  ) : (
                    <>
                      <li>每天首次进入获得3次机会，最多可累计10次；每次翻牌消耗1次。</li>
                      <li>次数为0时，可先看广告增加次数，也可点击卡牌看广告后直接翻牌。</li>
                    </>
                  )}
                  <li>每次有效翻牌必得50金币。</li>
                  <li>同一种图案累计4个即可获得对应大奖，无需连续出现。</li>
                  <li>图案首次集齐3个且奖励池余额充足时，场上会出现200金币奖励牌；看广告领取后不增加图案。</li>
                  <li>广告失败或中断时，不消耗卡牌，也不会发放奖励。</li>
                </ol>
                <button className="primary-button" onClick={() => setOverlay("none")}>我知道了</button>
              </div>
            )}
            {overlay === "dailyGift" && (
              <div className="modal ornate-modal daily-gift-modal">
                <button className="ornate-modal-close" onClick={() => setOverlay("none")} aria-label="关闭"><img src="/assets/game/close.png" alt="" /></button>
                <div className="gift-number">3</div>
                <h2>今日免费翻牌次数<br />已到账</h2>
                <p>每日登录可领取3次，观看广告最多可累计至10次</p>
                <button className="primary-button" onClick={claimDailyGift}>领取3次</button>
              </div>
            )}
            {overlay === "guaranteedIngot" && (
              <div className="modal guaranteed-modal">
                <SymbolIcon kind="ingot" />
                <h2>下一次必得金元宝</h2>
                <button className="primary-button" onClick={() => setOverlay("none")}>立即翻牌</button>
              </div>
            )}
            {overlay === "jackpotBoard" && (
              <div className="modal ornate-modal jackpot-board-modal">
                <button className="ornate-modal-close" onClick={() => setOverlay("none")} aria-label="关闭"><img src="/assets/game/close.png" alt="" /></button>
                <div className="jackpot-modal-hero" aria-hidden="true">
                  <img className="jackpot-hero-coin" src="/assets/game/coin-large.png" alt="" />
                  <img className="jackpot-hero-gift" src="/assets/game/gift-cube.png" alt="" />
                </div>
                <h2>100K币大奖榜</h2>
                <p>大奖已成功发放</p>
                <ol>
                  {jackpotRecords.map((record, index) => (
                    <li key={`${record.name}-${record.time}-${index}`}><span>{record.name}</span><time>{record.time}</time><strong>100K币</strong></li>
                  ))}
                </ol>
                <button className="primary-button" onClick={() => setOverlay("none")}>我知道了</button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
