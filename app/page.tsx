"use client";

import { useMemo, useState } from "react";

type SymbolKey = "jade" | "ingot" | "coin";
type Card = { id: number; symbol: SymbolKey | null };
type Overlay = "none" | "adPrompt" | "adPlaying" | "coinReward" | "settled" | "claimed" | "rules";

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

export default function Home() {
  const [cards, setCards] = useState<Card[]>(blankCards);
  const [counts, setCounts] = useState<Record<SymbolKey, number>>({ jade: 0, ingot: 0, coin: 0 });
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [pendingCard, setPendingCard] = useState<number | null>(null);
  const [winner, setWinner] = useState<SymbolKey | null>(null);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [adRequests, setAdRequests] = useState(0);
  const [adSuccess, setAdSuccess] = useState(0);
  const [skipAd, setSkipAd] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [nextSymbol, setNextSymbol] = useState<"random" | SymbolKey>("random");
  const [debugOpen, setDebugOpen] = useState(false);
  const [toast, setToast] = useState("");

  const flips = useMemo(() => cards.filter((card) => card.symbol).length, [cards]);

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
    setPendingCard(id);
    setOverlay("adPrompt");
  }

  function startAd() {
    setAdRequests((value) => value + 1);
    if (failNext) {
      setFailNext(false);
      setOverlay("none");
      setPendingCard(null);
      setToast("广告播放失败，卡牌未消耗，请重试");
      window.setTimeout(() => setToast(""), 2200);
      return;
    }
    if (skipAd) {
      finishAd();
      return;
    }
    setOverlay("adPlaying");
    window.setTimeout(finishAd, 1600);
  }

  function finishAd() {
    setAdSuccess((value) => value + 1);
    setOverlay("coinReward");
  }

  function receiveCoinReward() {
    if (pendingCard === null) return;
    const symbol = chooseSymbol();
    const nextCount = counts[symbol] + 1;
    setSessionCoins((value) => value + 50);
    setCards((current) => current.map((card) => card.id === pendingCard ? { ...card, symbol } : card));
    setCounts((current) => ({ ...current, [symbol]: nextCount }));
    setPendingCard(null);
    if (nextCount >= 4) {
      setWinner(symbol);
      window.setTimeout(() => setOverlay("settled"), 520);
    } else {
      setOverlay("none");
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
  }

  const rows: SymbolKey[] = ["jade", "ingot", "coin"];

  return (
    <main className="stage">
      <section className="phone-shell" aria-label="好运钱庄翻牌游戏">
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
                  <div className={`slot ${index < counts[kind] ? "slot-filled" : ""}`} key={index}>
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

        <footer className="counter-strip">
          <span>金币 <b>{sessionCoins}</b></span>
          <span>已翻 <b>{flips}</b>/12</span>
          <span>广告 <b>{adSuccess}</b></span>
        </footer>

        <div className="counter-scene" aria-hidden="true">
          <div className="coin-pile">◎ ◎</div>
          <div className="treasure-chest"><span>如意</span></div>
          <div className="money-bag">福</div>
        </div>

        {debugOpen && (
          <aside className="debug-panel">
            <div className="debug-title"><b>测试控制台</b><button onClick={() => setDebugOpen(false)}>×</button></div>
            <label><input type="checkbox" checked={skipAd} onChange={(event) => setSkipAd(event.target.checked)} /> 跳过模拟广告</label>
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

        {toast && <div className="toast">{toast}</div>}

        {overlay !== "none" && (
          <div className={`overlay overlay-${overlay}`}>
            {overlay === "adPrompt" && (
              <div className="modal reward-modal">
                <div className="coin-stack" />
                <h2>看广告翻转卡牌<br />并领取50金币！</h2>
                <button className="primary-button image-button" onClick={startAd}><img src="/assets/game/button-text-flip.png" alt="翻转卡牌" /></button>
                <button className="text-button" onClick={() => { setOverlay("none"); setPendingCard(null); }}>暂不翻牌</button>
              </div>
            )}
            {overlay === "adPlaying" && (
              <div className="ad-screen">
                <span className="ad-tag">模拟广告</span>
                <div className="ad-spinner" />
                <h2>好运正在赶来…</h2>
                <p>完整观看后即可翻牌</p>
              </div>
            )}
            {overlay === "coinReward" && (
              <div className="modal reward-modal">
                <div className="coin-stack" />
                <h2>获得50金币！</h2>
                <button className="primary-button" onClick={receiveCoinReward}>领取奖励</button>
              </div>
            )}
            {overlay === "settled" && winner && (
              <div className="settlement">
                <img className="confetti-image" src="/assets/game/confetti.png" alt="" />
                <img className="jackpot-title" src="/assets/game/jackpot-title.png" alt="大奖达成，鸿运到账" />
                <div className="winner-symbols">
                  {Array.from({ length: 4 }, (_, index) => <SymbolIcon kind={winner} key={index} />)}
                </div>
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
                <div className="open-chest">
                  <img src="/assets/game/reward-chest.png" alt="打开的奖励宝箱" />
                </div>
                <div className="ticket">
                  <small>✦ 奖励已领取 ✦</small>
                  <strong>{SYMBOLS[winner].reward}</strong>
                  <button className="primary-button" onClick={resetGame}>再来一局</button>
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
