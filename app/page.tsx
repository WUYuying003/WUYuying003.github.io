"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type SymbolKey = "jade" | "ingot" | "coin";
type Card = { id: number; symbol: SymbolKey | null };
type Overlay = "none" | "adPrompt" | "celebration" | "settled" | "rules";
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

const INTRO_SEQUENCE: SymbolKey[] = ["coin", "ingot", "jade"];
const DECK_COPIES_PER_SYMBOL = 4;
const REPEAT_WEIGHT_MULTIPLIER = 0.3;
const COIN_BASE_WEIGHT_MULTIPLIER = 2.7;
const JADE_CAP_WEIGHT = 0.0015;
const INGOT_CAP_WEIGHT = 0.05;
const WINNER_ROW_DURATION_MS = 3200;
const CELEBRATION_DURATION_MS = 1000;

function SymbolIcon({ kind, small = false }: { kind: SymbolKey; small?: boolean }) {
  const files: Record<SymbolKey, string> = small
    ? { jade: "jade-small.png", ingot: "ingot-small.png", coin: "progress-coin.png" }
    : { jade: "jade-large.png", ingot: "ingot-large.png", coin: "coin-large.png" };
  return <img className={`symbol symbol-${kind} ${small ? "symbol-small" : ""}`} src={`/assets/game/${files[kind]}`} alt={SYMBOLS[kind].name} />;
}

function blankCards(): Card[] {
  return Array.from({ length: 12 }, (_, id) => ({ id, symbol: null }));
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

export default function Home() {
  const [cards, setCards] = useState<Card[]>(blankCards);
  const [counts, setCounts] = useState<Record<SymbolKey, number>>({ jade: 0, ingot: 0, coin: 0 });
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [pendingCard, setPendingCard] = useState<number | null>(null);
  const [winner, setWinner] = useState<SymbolKey | null>(null);
  const [sessionCoins, setSessionCoins] = useState(0);
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

  useEffect(() => {
    bgmRef.current = new Audio("/assets/game/audio/game-bgm.mp3");
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.28;
    return () => {
      bgmRef.current?.pause();
      flipSoundRef.current?.pause();
      rewardSoundRef.current?.pause();
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (settlementTimerRef.current !== null) window.clearTimeout(settlementTimerRef.current);
      if (celebrationTimerRef.current !== null) window.clearTimeout(celebrationTimerRef.current);
    };
  }, []);

  function unlockBgm() {
    if (bgmRef.current?.paused) void bgmRef.current.play().catch(() => undefined);
  }

  function playSound(file: string, volume = 0.86) {
    flipSoundRef.current?.pause();
    const sound = new Audio(`/assets/game/audio/${file}`);
    sound.volume = volume;
    flipSoundRef.current = sound;
    sound.addEventListener("ended", () => {
      if (flipSoundRef.current === sound) flipSoundRef.current = null;
    }, { once: true });
    void sound.play().catch(() => undefined);
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

  function chooseSymbol(flipIndex: number): SymbolKey {
    if (nextSymbol !== "random") {
      const chosen = nextSymbol;
      setNextSymbol("random");
      return chosen;
    }
    if (flipIndex < INTRO_SEQUENCE.length) return INTRO_SEQUENCE[flipIndex];

    const remaining = {
      jade: DECK_COPIES_PER_SYMBOL - counts.jade,
      ingot: DECK_COPIES_PER_SYMBOL - counts.ingot,
      coin: DECK_COPIES_PER_SYMBOL - counts.coin,
    };
    const weights: Record<SymbolKey, number> = {
      jade: remaining.jade <= 0 ? 0 : counts.jade >= 3 ? JADE_CAP_WEIGHT : 3 * remaining.jade,
      ingot: remaining.ingot <= 0 ? 0 : counts.ingot >= 3 ? INGOT_CAP_WEIGHT : 0.8 * remaining.ingot,
      coin: COIN_BASE_WEIGHT_MULTIPLIER * Math.max(0, remaining.coin),
    };
    const lastSymbol = drawHistoryRef.current.at(-1);
    const previousSymbol = drawHistoryRef.current.at(-2);
    if (lastSymbol) {
      weights[lastSymbol] = lastSymbol === previousSymbol
        ? 0
        : weights[lastSymbol] * REPEAT_WEIGHT_MULTIPLIER;
    }
    const totalWeight = weights.jade + weights.ingot + weights.coin;
    const randomValue = new Uint32Array(1);
    window.crypto.getRandomValues(randomValue);
    const value = (randomValue[0] / 0x100000000) * totalWeight;
    if (value < weights.jade) return "jade";
    if (value < weights.jade + weights.ingot) return "ingot";
    return "coin";
  }

  function clickCard(id: number) {
    if (overlay !== "none" || winner || cards[id].symbol) return;
    unlockBgm();
    if (flips < 5) {
      revealCard(id);
      return;
    }
    setPendingCard(id);
    setOverlay("adPrompt");
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
    if (pendingCard !== null) revealCard(pendingCard);
  }

  function revealCard(cardId: number) {
    const symbol = chooseSymbol(flips);
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

    if (nextCount < 4) {
      playSound(
        symbol === "jade" ? "flip-jade.mp3" : symbol === "ingot" ? "flip-major.mp3" : "flip-small.mp3",
        symbol === "jade" ? 1 : 0.86,
      );
    }
    setSessionCoins((value) => value + 50);
    setCards((current) => current.map((card) => card.id === cardId ? { ...card, symbol } : card));
    setCounts((current) => ({ ...current, [symbol]: nextCount }));
    setPendingCard(null);
    setOverlay("none");
    showToast("获得50金币!");
    if (nextCount >= 4) {
      setWinner(symbol);
      setDebugOpen(false);
      playRewardSound(symbol === "jade" ? "reward-100k.mp3" : symbol === "ingot" ? "reward-600.mp3" : "reward-1k.wav");
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
    flipSoundRef.current?.pause();
    flipSoundRef.current = null;
    stopRewardSound();
    setCards(blankCards());
    setCounts({ jade: 0, ingot: 0, coin: 0 });
    setOverlay("none");
    setPendingCard(null);
    setWinner(null);
    setAdRequests(0);
    setAdSuccess(0);
    setToast("");
    setFlyAnimation(null);
    drawHistoryRef.current = [];
  }

  const rows: SymbolKey[] = ["jade", "ingot", "coin"];

  return (
    <main className="stage">
      <section className="phone-shell" ref={shellRef} aria-label="好运钱庄翻牌游戏">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <header className="bank-header">
          <button className="round-tool rules-tool" onClick={() => setOverlay("rules")} disabled={Boolean(winner)} aria-label="查看规则">?</button>
          <div className="roof roof-left" />
          <div className="roof roof-right" />
          <div className="portrait" aria-hidden="true">♬</div>
          <div className="title-plaque">好运钱庄</div>
          <p>✦ 集齐4个同款，赢取奖励 ✦</p>
          <button className="round-tool debug-tool" onClick={() => setDebugOpen((value) => !value)} disabled={Boolean(winner)} aria-label="打开测试面板">⚙</button>
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
              className={`flip-card ${card.symbol ? "is-open" : ""} ${winner && card.symbol === winner ? "winning-card" : ""}`}
              key={card.id}
              ref={(node) => { cardRefs.current[card.id] = node; }}
              onClick={() => clickCard(card.id)}
              disabled={Boolean(card.symbol) || Boolean(winner) || overlay !== "none"}
              aria-label={card.symbol ? `已翻出${SYMBOLS[card.symbol].name}` : `翻开第${card.id + 1}张卡牌`}
            >
              <span className="card-inner">
                <span className="card-back" />
                <span className="card-front">{card.symbol && <SymbolIcon kind={card.symbol} />}</span>
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
            <button className={failNext ? "debug-danger active" : "debug-danger"} onClick={() => setFailNext(true)}>下一次广告失败</button>
            <button onClick={resetGame}>重置本局</button>
            <div className="debug-stats">
              <span>翻牌 {flips}</span><span>广告 {adSuccess}/{adRequests}</span>
              <span>免广告 {Math.max(0, 5 - flips)}</span><span>下次 {flips < 5 ? "免费" : "广告"}</span>
              <span>玉 {counts.jade}</span><span>元宝 {counts.ingot}</span><span>铜钱 {counts.coin}</span>
              <span>金币 {sessionCoins}</span>
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
                <h2>看广告翻转卡牌<br />并领取50金币！</h2>
                <button className="primary-button image-button" onClick={startAd}><img src="/assets/game/button-text-flip.png" alt="翻转卡牌" /></button>
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
                  <li>前5次可直接免费翻牌，第6次起完整观看广告后即可翻牌。</li>
                  <li>前3次必定集齐三种不同图案，第4次起进入随机抽取。</li>
                  <li>每次有效翻牌必得50金币。</li>
                  <li>同一种图案累计4个即可获得对应大奖，无需连续出现。</li>
                  <li>广告失败或中断时，不消耗卡牌，也不会发放奖励。</li>
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
