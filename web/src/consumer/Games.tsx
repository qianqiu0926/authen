import { nourish } from "./farm";
import Slicer from "./games/SlicerGame";
import { uid } from "./model";
import { useState } from "react";
import { useApp } from "./store";
import { art, Icon, Pill, Primary, Sheet } from "./ui";
import { earn } from "./model";
export function Games() {
  const { state, setState, open, feedback } = useApp(),
    [mode, setMode] = useState("真假切切看"),
    [round, setRound] = useState(0),
    [answered, setAnswered] = useState<boolean | null>(null),
    [correct, setCorrect] = useState(0),
    [finished, setFinished] = useState(false);
  const reward = (key: string, title: string) =>
    setState((s) => nourish({ ...s, social: earn(s.social, key, title) }, "learn", uid()));
  const answer = (ai: boolean) => {
    if (answered !== null) return;
    const good = ai === (round === 1);
    setAnswered(good);
    if (good) setCorrect(correct + 1);
    feedback();
  };
  return (
    <div className="page games">
      <header className="game-heading">
        <div>
          <h1>真假游乐场</h1>
          <p>玩一局，给花园攒点水</p>
        </div>
        <Icon name="game" size={65} />
      </header>
      <div className="segmented">
        {["真假切切看", "来源小侦探"].map((m) => (
          <button
            key={m}
            className={m === mode ? "selected" : ""}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      {mode === "真假切切看" ? (
        <Slicer />
      ) : (
        <div className="origin-game">
          {finished ? (
            <>
              <Icon name="leaf" size={90} />
              <h2>答对 {correct} / 2 题</h2>
              <p>
                像实拍，也可能是 AI
                画的。想知道图片怎么来的，可以点开原帖找制作说明。用了
                AI，也不代表在骗人。
              </p>
              <Pill mint>奖励已收好，去花园看看吧</Pill>
              <Primary onClick={() => {setRound(0);setCorrect(0);setAnswered(null);setFinished(false);}}>再玩一次</Primary>
            </>
          ) : (
            <>
              <b>第 {round + 1} / 2 张 · 实拍还是 AI 画的？</b>
              <img
                className="origin-image"
                src={art(round === 0 ? "game-photo" : "compact")}
                alt="游戏中的美妆图片"
              />
              <div className="two-buttons">
                <button
                  disabled={answered !== null}
                  onClick={() => answer(false)}
                >
                  实拍照片
                </button>
                <button
                  disabled={answered !== null}
                  onClick={() => answer(true)}
                >
                  AI 画的
                </button>
              </div>
              {answered !== null && (
                <>
                  <h3>{answered ? "答对啦" : "这张没猜中，看看答案吧"}</h3>
                  <p>
                    {round === 0
                      ? "原图页面写着：这是 stux 拍的照片。我们没看过拍摄过程，目前只能按页面介绍作答。"
                      : "这张图是我们用 AI 画的，制作过程有记录。只看画面，很难猜准吧？"}
                  </p>
                  {round === 0 && (
                    <a
                      href="https://commons.wikimedia.org/wiki/File:Cream_in_round_container.jpg"
                      target="_blank"
                      rel="noreferrer"
                    >
                      看看原图介绍 ↗
                    </a>
                  )}
                  <Primary
                    onClick={() => {
                      if (round === 0) {
                        setRound(1);
                        setAnswered(null);
                      } else {
                        setFinished(true);
                        reward("origin-v1", "来源小侦探完成");
                      }
                    }}
                  >
                    {round === 0 ? "下一张" : "收下小叶子"}
                  </Primary>
                </>
              )}
            </>
          )}
        </div>
      )}
      <button className="game-garden-link" onClick={() => open("farm")}><img src="/authen/app/garden/soft-flower-bloom.png" alt=""/><span>带水滴去花园</span><b>照顾我的花 ›</b></button>
      <div className="leaf-balance">
        <Icon name="leaf" size={34} />
        <b>已有 {state.social.leaves} 片小叶子</b>
        <button onClick={() => open("room")}>去装扮 ›</button>
      </div>
    </div>
  );
}
export function Wallet() {
  const { state, open, setSheet, setTab } = useApp();
  return (
    <Sheet title="我的小叶子">
      <div className="sheet-content">
        <div className="wallet-total">
          <div>
            <strong>{state.social.leaves}</strong>
            <p>片小叶子，可以用来装扮小屋</p>
          </div>
          <Icon name="leaf" size={100} />
        </div>
        <Primary
          onClick={() => {
            setSheet(null);
            setTab("游乐场");
          }}
        >
          去玩一关
        </Primary>
        <button className="row-link card" onClick={() => open("room")}>
          <Icon name="house" size={45} />
          <b>挑选小屋装饰</b>
          <span>↗</span>
        </button>
        <article className="card text-card">
          <h3>品牌兑换</h3>
          <p>实物兑换尚未开放，小叶子目前可兑换小屋装饰。</p>
          <button className="product-restore" onClick={()=>{setSheet(null);setTab("我的");}}>去知识库看收藏的产品资料 ↗</button>
        </article>
        <h2>小叶子账本</h2>
        {!state.social.ledger.length && (
          <p className="muted">完成挑战后，奖励会记在这里</p>
        )}
        {state.social.ledger.map((e) => (
          <article className="ledger-entry card" key={e.id}>
            <div>
              <b>{e.title}</b>
              <small>{new Date(e.date).toLocaleDateString("zh-CN")}</small>
            </div>
            <strong>
              {e.amount > 0 ? "+" : ""}
              {e.amount}
            </strong>
          </article>
        ))}
      </div>
    </Sheet>
  );
}
