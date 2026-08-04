"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type SymbolKey = "jade" | "ingot" | "coin";
type Card = { id: number; symbol: SymbolKey | null };
type Overlay = "none" | "adPrompt" | "settled" | "claimed" | "rules";
type FlyAnimation = {
  id: number;
  symbol: SymbolKey;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

const SYMBOLS: Record<SymbolKey, { name: string; reward: string; weight: number }> = {
  jade: { name: "玉如意", reward: "100KB", weight: 0.065165 },
  ingot: { name: "金元宝", reward: "1KB", weight: 0.161553 },
  coin: { name: "方孔金币", reward: "600金币", weight: 0.773282 },
};

function SymbolIcon({ kind, small = false }: { kind: SymbolKey; small?: boolean }) {
  const files: Record<SymbolKey, string> = small
    ? { jade: "jade-small.png", ingot: "ingot-small.png", coin: "progress-coin.png" }
    : { jade: "jade-large.png", ingot: "ingot-large.png", coin: "coin-large.png" };
  return <img className={`symbol symbol-${kind} ${small ? "symbol-small" : ""}`} src={`/assets/game/${files[kind]}`} alt={SYMBOLS[kind].name} />;
}

function blankCards(): Card[] {
  return Array.from({ length: 12 }, (_, id) => ({ id, symbol: null }));
}

function FinalCardGrid({ cards, winner, dimmed = false }: { cards: Card[]; winner: SymbolKey; dimmed?: boolean }) {
  return (
    <div className={`final-card-grid ${dimmed ? "is-dimmed" : ""}`} aria-hidden="true">
      {cards.map((card) => (
        <span
          className={`final-card ${card.symbol === winner ? "is-winner" : ""} ${card.symbol ? "has-symbol" : ""}`}
          key={card.id}
        >
          {card.symbol && <SymbolIcon kind={card.symbol} />}
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
  const [flyAnimation, setFlyAnimation] = useState<FlyAnimation | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const settlementTimerRef = useRef<number | null>(null);

  const flips = useMemo(() => cards.filter((card) => card.symbol).length, [cards]);

  useEffect(() => {
    bgmRef.current = new Audio("/assets/game/audio/game-bgm.mp3");
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.28;
    return () => {
      bgmRef.current?.pause();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (settlementTimerRef.current) window.clearTimeout(settlementTimerRef.current);
    };
  }, []);

  function unlockBgm() {
    if (bgmRef.current?.paused) void bgmRef.current.play().catch(() => undefined);
  }

  function playSound(file: string, volume = 0.86) {
    const sound = new Audio(`/assets/game/audio/${file}`);
    sound.volume = volume;
    void sound.play().catch(() => undefined);
  }

  function showToast(message: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 5000);
  }

  function chooseSymbol(): SymbolKey {
    if (nextSymbol !== "random") {
      const chosen = nextSymbol;
      setNextSymbol("random");
      return chosen;
    }
    const value = Math.random();
    if (value < SYMBOLS.jade.weight) return "jade";
    if (value < SYMBOLS.jade.weight + SYMBOLS.ingot.weight) return "ingot";
    return "coin";
  }

  function clickCard(id: number) {
    if (overlay !== "none" || winner || cards[id].symbol) return;
    unlockBgm();
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
    revealPendingCard();
  }

  function revealPendingCard() {
    if (pendingCard === null) return;
    const symbol = chooseSymbol();
    const nextCount = counts[symbol] + 1;
    const shellRect = shellRef.current?.getBoundingClientRect();
    const cardRect = cardRefs.current[pendingCard]?.getBoundingClientRect();
    const targetRect = slotRefs.current[`${symbol}-${Math.min(counts[symbol], 3)}`]?.getBoundingClientRect();

    if (shellRect && cardRect && targetRect) {
      setFlyAnimation({
        id: Date.now(),
        symbol,
        fromX: cardRect.left + cardRect.width / 2 - shellRect.left,
        fromY: cardRect.top + cardRect.height / 2 - shellRect.top,
        toX: targetRect.left + targetRect.width / 2 - shellRect.left,
        toY: targetRect.top + targetRect.height / 2 - shellRect.top,
      });
      window.setTimeout(() => setFlyAnimation(null), 980);
    }

    playSound(symbol === "coin" ? "flip-small.mp3" : "flip-major.mp3");
    setSessionCoins((value) => value + 50);
    setCards((current) => current.map((card) => card.id === pendingCard ? { ...card, symbol } : card));
    setCounts((current) => ({ ...current, [symbol]: nextCount }));
    setPendingCard(null);
    setOverlay("none");
    showToast("获得50金币!");
    if (nextCount >= 4) {
      setWinner(symbol);
      playSound(symbol === "jade" ? "reward-100k.mp3" : symbol === "ingot" ? "reward-1k.wav" : "reward-600.mp3", 1);
      settlementTimerRef.current = window.setTimeout(() => setOverlay("settled"), 3200);
    }
  }

  function resetGame() {
    setCards(blankCards());
    setCounts({ jade: 0, ingot: 0, coin: 0 });
    setOverlay("none");
    setPendingCard(null);
    setWinner(null);
    setAdRequests(0);
    setAdSuccess(0);
    setToast("");
    setFlyAnimation(null);
  }

  const rows: SymbolKey[] = ["jade", "ingot", "coin"];

  return (
    <main className="stage">
      <section className="phone-shell" ref={shellRef} aria-label="好运钱庄翻牌游戏">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <header className="bank-header">
          <button className="round-tool rules-tool" onClick={() => setOverlay("rules")} aria-label="查看规则">?</button>
          <div className="roof roof-left" />
          <div className="roof roof-right" />
          <div className="portrait" aria-hidden="true">♬</div>
          <div className="title-plaque">好运钱庄</div>
          <p>✦ 集齐4个同款，赢取奖励 ✦</p>
          <button className="round-tool debug-tool" onClick={() => setDebugOpen((value) => !value)} aria-label="打开测试面板">⚙</button>
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
              <span>玉 {counts.jade}</span><span>元宝 {counts.ingot}</span><span>铜钱 {counts.coin}</span>
              <span>金币 {sessionCoins}</span>
            </div>
          </aside>
        )}

        {flyAnimation && (
          <div
            className="flying-symbol"
            key={flyAnimation.id}
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
          <div className="coin-toast" role="status" aria-label={toast}>
            <img src="/assets/game/coin-toast-50.png" alt="获得50金币" />
          </div>
        ) : (
          <div className="error-toast" role="status">{toast}</div>
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
                  <button className="primary-button" onClick={() => setOverlay("claimed")}>领取奖励</button>
                </div>
              </div>
            )}
            {overlay === "claimed" && winner && (
              <div className="claimed-screen">
                <img className="confetti-image" src="/assets/game/confetti.png" alt="" />
                <img className="jackpot-title" src="/assets/game/jackpot-title.png" alt="大奖达成，鸿运到账" />
                <FinalCardGrid cards={cards} winner={winner} dimmed />
                <div className="open-chest">
                  <img src="/assets/game/reward-chest.png" alt="打开的奖励宝箱" />
                </div>
                <div className="ticket">
                  <small>✦ 恭喜获得 ✦</small>
                  <strong>{SYMBOLS[winner].reward}</strong>
                  <button className="primary-button" onClick={resetGame}>领取奖励</button>
                </div>
              </div>
            )}
            {overlay === "rules" && (
              <div className="modal rules-modal">
                <h2>活动规则</h2>
                <ol>
                  <li>点击未翻开的卡牌，完整观看广告后即可翻牌。</li>
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
