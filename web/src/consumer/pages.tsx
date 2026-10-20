import {reportProducts} from "../../products.mjs";
import Growth from "./Growth";
import { useState } from "react";
import {
  ArrowUpRight,
  ArrowUpDown,
  Bookmark,
  ChevronRight,
  Heart,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { useApp } from "./store";
import { scenarioMap } from "./scenarios";
import { art, Empty, Icon, Leaf, Pill, SearchField } from "./ui";
import type { Kind } from "../types";
import type { Post } from "./model";
export const entries: { kind: Kind; name: string; icon: string }[] = [
  { kind: "image", name: "图片 / 截图", icon: "image" },
  { kind: "video", name: "视频", icon: "video" },
  { kind: "text", name: "文章 / 文字", icon: "notebook" },
  { kind: "link", name: "链接 / 评论", icon: "box" },
  { kind: "audio", name: "音频 / 口播", icon: "audio" },
];
export function Toolbox() {
  const { state, open, setTab } = useApp(),
    featured = state.social.posts.find((p) => p.id === "zg5xAafJ080"),
    lessons = state.social.posts.filter((p) => p.category === "鉴真课堂");
  return (
    <div className="page toolbox">
      <header className="page-heading">
        <div>
          <span className="eyebrow">AUTHEN CLUB</span>
          <h1>百宝箱</h1>
        </div>
        <Leaf />
        <button
          className="round"
          aria-label="设置"
          onClick={() => open("settings")}
        >
          <SlidersHorizontal size={20} />
        </button>
      </header>
      <section className="home-hero unified-hero">
        <i />
        <img src={art("character-curious-bust")} alt="红眼镜美妆助手" />
        <span className="buddy-label">YOUR BEAUTY BUDDY</span>
        <div className="hero-copy">
          <span className="hero-kicker">种草先别急</span>
          <h2>
            这份心动，
            <br />
            值得相信吗？
          </h2>
          <div className="hero-scenes" aria-label="按场景查">
            <button onClick={() => open("smart", undefined, { scenario: "comments" })}>
              好评真实吗
            </button>
            <button onClick={() => open("smart", undefined, { scenario: "post" })}>
              功效靠谱吗
            </button>
            <button onClick={() => open("smart", undefined, { scenario: "image" })}>
              妆效有修饰吗
            </button>
          </div>
        </div>
        <button
          className="unified-entry"
          onClick={() => open("smart")}
          aria-label="发来看看"
        >
          <span>
            <b>链接、截图、笔记，发来看看</b>
            <small>不必选类型，AI 帮你分清</small>
          </span>
          <ArrowUpRight size={22} />
        </button>
      </section>
      <section className="scenarios" aria-label="按场景查">
        <div className="section-heading">
          <h2>按场景查，更快</h2>
          <span>拿不准就点右下角的小人</span>
        </div>
        <div className="scenario-grid">
          {(["post", "comments", "image", "video"] as const).map((id) => {
            const s = scenarioMap[id];
            return (
              <button
                key={id}
                className="scenario-card"
                aria-label={"查" + s.name}
                onClick={() =>
                  open("smart", undefined, { scenario: s.id, focus: s.focus })
                }
              >
                <Icon name={s.icon} size={38} />
                <b>{s.name}</b>
                <small>{s.short}</small>
              </button>
            );
          })}
        </div>
      </section>
      <Growth />
      <section className="discover">
        <div className="section-heading">
          <h2>我的发现</h2>
          <button onClick={() => setTab("动态")}>更多灵感 ›</button>
        </div>
        {featured && (
          <button
            className="discover-lead card"
            onClick={() => open("post", featured.id)}
          >
            <div className="discover-image">
              <img src={featured.image} alt={featured.title} />
              <span>▶ {featured.duration}</span>
            </div>
            <div>
              <Pill>唇妆小功课</Pill>
              <h3>{featured.title}</h3>
              <p>内侧薄涂、轻抿，再向外晕开</p>
              <small>
                {featured.author}
                <ArrowUpRight size={14} />
              </small>
            </div>
          </button>
        )}
        <div className="section-heading subsection">
          <h3>种草前，看看这几点</h3>
          <span>美妆 × 鉴真</span>
        </div>
        {lessons.map((p) => (
          <button
            className="discovery-row card"
            key={p.id}
            onClick={() => open("post", p.id)}
          >
            <img src={p.image} alt="" />
            <div>
              <h3>{p.title}</h3>
              <small>{p.author}</small>
            </div>
            <ChevronRight size={14} />
          </button>
        ))}
      </section>
    </div>
  );
}
export function PostArt({ post }: { post: Post }) {
  return post.image ? (
    <img src={post.image} alt={post.title} loading="lazy" />
  ) : (
    <div className="post-art-fallback">
      <Icon name="notebook" size={68} />
      <b>{post.title.slice(0, 24)}</b>
    </div>
  );
}
export function Feed() {
  const { state, open, updatePost } = useApp(),
    [category, setCategory] = useState("全部"),
    [query, setQuery] = useState(""),
    [newest, setNewest] = useState(false);
  const posts = state.social.posts
    .filter(
      (p) =>
        (category === "全部" || p.category === category) &&
        (!query ||
          (p.title + p.text).toLowerCase().includes(query.toLowerCase())),
    )
    .slice()
    .sort((a, b) =>
      newest
        ? b.date.localeCompare(a.date)
        : Number(!!b.isMine) - Number(!!a.isMine),
    );
  return (
    <div className="page feed">
      <header className="page-heading">
        <div>
          <span className="eyebrow">BEAUTY TOGETHER</span>
          <h1>动态</h1>
        </div>
        <button className="small-red" onClick={() => open("compose")}>
          <Plus size={17} />
          发动态
        </button>
      </header>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="搜唇妆、底妆、鉴真课堂"
      />
      <div className="feed-intro">
        <Icon name="social" size={53} />
        <div>
          <b>把好看的妆，变成自己的灵感</b>
          <small>YouTube 教程精选 · 保留原作者与原图</small>
        </div>
      </div>
      <div className="category-tabs">
        {[
          "全部",
          "鉴真课堂",
          "唇妆教程",
          "试色功课",
          "美妆日常",
          "鉴真心得",
          "成分功课",
        ].map((c) => (
          <button
            key={c}
            className={c === category ? "selected" : ""}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="section-heading">
        <h3>发现美一点的日常</h3>
        <button onClick={() => setNewest(!newest)}>
          {newest ? "按发布时间" : "精选内容"}
          <ArrowUpDown size={12} />
        </button>
      </div>
      {!posts.length && (
        <Empty
          title="还没有相关动态"
          detail="换个关键词，或分享你的发现"
          icon="social"
        />
      )}
      <div className="feed-columns">
        {[0, 1].map((col) => (
          <div key={col}>
            {posts
              .filter((_, i) => i % 2 === col)
              .map((p, i) => (
                <article className="feed-tile card" key={p.id}>
                  <button
                    className={"post-thumb " + (i % 3 === 0 ? "tall" : "")}
                    onClick={() => open("post", p.id)}
                  >
                    <PostArt post={p} />
                    {p.sourceURL && (
                      <Pill>{p.isMine ? "分享链接" : "YouTube"}</Pill>
                    )}
                  </button>
                  <div className="feed-tile-body">
                    <button
                      className="post-title"
                      onClick={() => open("post", p.id)}
                    >
                      {p.title}
                    </button>
                    <footer>
                      <small>{p.author}</small>
                      <button
                        aria-label={"喜欢-" + p.title}
                        onClick={() => updatePost(p.id, { liked: !p.liked })}
                      >
                        <Heart
                          size={15}
                          fill={p.liked ? "currentColor" : "none"}
                        />
                      </button>
                    </footer>
                  </div>
                </article>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
export function Profile() {
  const { state, open } = useApp(),
    [section, setSection] = useState("知识库"),
    [query, setQuery] = useState("");
  const records = state.reports.filter(
    (r) =>
      (section !== "知识库" || r.saved) &&
      (!query || (r.original + r.summary + reportProducts(r).map(p=>p.brand.name+(p.product?.name||"" )).join(" ")).toLowerCase().includes(query.toLowerCase())),
  );
  const posts = state.social.posts.filter((p) =>
    section === "发布" ? p.isMine : p.bookmarked,
  );
  return (
    <div className="page profile">
      <header className="page-heading">
        <h1>我的</h1>
        <Leaf />
        <button
          className="round"
          aria-label="设置"
          onClick={() => open("settings")}
        >
          <Settings size={21} />
        </button>
      </header>
      <section className="profile-card card">
        <img src={art("character-bust")} alt="我的美妆档案" />
        <div>
          <h2>我的美妆档案</h2>
          <p>{state.social.room.style} · 风格由你定义</p>
          <div>
            <Pill>{state.reports.length} 次查阅</Pill>
            <Pill mint>
              {state.reports.filter((r) => r.saved).length} 张收藏
            </Pill>
          </div>
        </div>
      </section>
      <button className="room-entry" onClick={() => open("room")}>
        <Icon name="house" size={55} />
        <div>
          <b>走进我的 3D 小屋</b>
          <small>装扮自己，也装扮日常</small>
        </div>
        <ArrowUpRight size={22} />
      </button>
      <div className="profile-tabs">
        {["知识库", "足迹", "发布", "收藏动态"].map((s) => (
          <button
            className={section === s ? "selected" : ""}
            key={s}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {["知识库", "足迹"].includes(section) ? (
        <>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="找成分、问题或资料"
          />
          {!records.length && (
            <Empty
              title={
                section === "知识库"
                  ? "收藏的答案，会放在这里"
                  : "还没有查过的内容"
              }
              detail="去百宝箱，发来你想查的笔记或图片"
            />
          )}
          {records.map((r) => (
            <button
              className="record-preview card"
              key={r.id}
              onClick={() => open("card", r.id)}
            >
              <Icon name="image" size={48} />
              <div>
                <header>
                  <Pill>
                    {r.sample
                      ? "演示资料卡"
                      : r.verdict === "flagged"
                        ? "这几处要留意"
                        : "我的资料卡"}
                  </Pill>
                  <small>
                    {new Date(r.date).toLocaleDateString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </small>
                </header>
                <b>{r.summary}</b>
                <small>{r.saved ? "已收藏" : "查过的内容"}</small>
                {!!reportProducts(r).length && <span className="record-product-label">产品资料 · {reportProducts(r).map(p=>p.product?.name||p.brand.name).join(" / ")}</span>}
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
        </>
      ) : (
        <>
          {!posts.length && (
            <Empty
              title="还没有内容"
              detail="去动态写一篇，或收藏喜欢的帖子"
              icon="social"
            />
          )}
          {posts.map((p) => (
            <button
              key={p.id}
              className="discovery-row card"
              onClick={() => open("post", p.id)}
            >
              <div className="profile-post-art">
                <PostArt post={p} />
              </div>
              <div>
                <h3>{p.title}</h3>
                <small>{p.category}</small>
              </div>
              <Bookmark size={15} />
            </button>
          ))}
        </>
      )}
    </div>
  );
}
