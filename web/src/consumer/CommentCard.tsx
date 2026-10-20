import { ChevronDown, MessageCircle, ImagePlus } from 'lucide-react';
import type { PageSource } from '../types';
import './comments.css';

export default function CommentCard({page,onSupplement}:{page:PageSource;onSupplement:()=>void}) {
  const data=page.commentAnalysis, available=!!data?.total;
  return <section className="comment-check" aria-label="评论区一起看">
    <header><span><MessageCircle size={17}/>评论区一起看</span><small>{available?`读到 ${data.readCount} 条`:'还没读到'}</small></header>
    {available?<>
      <div className="comment-check-score"><div><span>可疑话术占比</span><strong>{data.percent===null?'—':data.percent}<em>{data.percent===null?'样本少':'%'}</em></strong></div><p>{data.summary}</p></div>
      <div className="comment-check-bar" aria-hidden="true"><i style={{width:`${data.suspicious/data.total*100}%`}}/><i style={{width:`${data.detailed/data.total*100}%`}}/><i style={{width:`${data.unknown/data.total*100}%`}}/></div>
      <div className="comment-check-counts"><span><i/>话术可疑<b>{data.suspicious} 条</b></span><span><i/>有使用细节<b>{data.detailed} 条</b></span><span><i/>暂难判断<b>{data.unknown} 条</b></span></div>
      <p className="comment-check-scope">只统计这次读到的 {data.total} 条用户评论{data.replies?`（含 ${data.replies} 条回复）`:''}{data.authorReplies?`，已排除 ${data.authorReplies} 条作者回复`:''}。{data.percent===null?'不足 10 条，暂不算占比。':'不是全部评论的真假比例。'}</p>
      <details className="comment-check-details"><summary>为什么这样算 <ChevronDown size={14}/></summary>
        <p>比较相同或高度相似的长句，至少有 3 位不同昵称或账号发过才计入。简单的“好用”和普通赞同不算。其他评论按“有使用细节”和“暂难判断”列出，都不代表已经证实真实。</p>
        {data.groups.map((group,i)=><div className="comment-pattern" key={i}><b>{group.reason} · {group.count} 条</b>{group.comments.map((comment,j)=><blockquote key={j}><span>{comment.author||`用户 ${j+1}`}</span>{comment.text}</blockquote>)}</div>)}
        {!data.groups.length&&<p>这批评论里暂没发现成组的重复长句，不代表没有刷评。</p>}
        {!!data.details.length&&<div className="comment-pattern"><b>这些评论写了具体感受</b>{data.details.map((comment,i)=><blockquote key={i}><span>{comment.author||`用户 ${i+1}`}</span>{comment.text}</blockquote>)}</div>}
        <p>重复内容也可能是跟风或引用，只作提醒，不认定账号是水军。{data.limited?'本次还受读取条数或字数上限限制。':''}</p>
      </details>
    </>:<div className="comment-check-empty"><b>{data?.authorReplies?'目前只读到了作者回复':'这次没读到用户评论'}</b><p>平台可能需要登录或没有公开展示。还不能判断好评是否可信。</p><button onClick={onSupplement}><ImagePlus size={15}/>补评论截图 / 文字</button></div>}
  </section>;
}
