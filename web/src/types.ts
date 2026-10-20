export type Kind='image'|'video'|'text'|'link'|'audio'|'comments';
export type Verdict='flagged'|'supported'|'unclear';
export interface PublicComment {id?:string;text:string;author?:string;authorKey?:string;isAuthor?:boolean;isReply?:boolean}
export interface CommentAnalysis {version:number;method:string;status:'unavailable'|'small_sample'|'ready';readCount:number;total:number;replies:number;authorReplies:number;duplicates:number;suspicious:number;detailed:number;unknown:number;percent:number|null;partial:boolean;limited:boolean;summary:string;groups:{kind:string;count:number;reason:string;comments:PublicComment[]}[];details:PublicComment[]}
export interface PageSource {url:string;title:string;platform:string;author?:string|null;contentType:string;coverage:{text:boolean;reviews:number;images:number;excerptOnly?:boolean;shareOnly?:boolean};limitations:string[];reviews?:PublicComment[];commentAnalysis?:CommentAnalysis}
export interface LinkIssue {url:string;message:string;code:string}
export interface Material {shareOnly?:boolean;linkUnavailable?:LinkIssue;audience?:'enterprise'|'consumer';kind:Kind;text:string;images:string[];url?:string;video?:Blob;audio?:Blob;sample?:Verdict;page?:PageSource;skipLink?:boolean}
export interface Line {text:string;box?:number[];imageIndex?:number;seconds?:number}
export interface Evidence extends Line {finding:string;why:string;source:string;excerpt:string;sourceURL?:string}
export interface DimSummary {dim:string;applicable:string;result:string;note:string}
export interface EvidenceCard {card_id:string;evidence_id:string;dim:string;title:string;quote:string;observation:string;explanation:string;alt_explanations:string[];cannot_infer:string[];location_quality:string;direction:string;image_index?:number;seconds?:number;box?:number[]}
export interface Presentation {
  presentation_state:string;presentation_family:string;state_subtitle:string;state_reason:string;
  confidence_tier:string;dimension_summary:DimSummary[];evidence_cards:EvidenceCard[];
  limitations:string[];next_action:string;reason_steps:string[];reason_detail:string;a11y_label:string;
  aggregate_state:string;total_decision:string;e2_subtype:string;rejection_reason_code:string;
  rule_version:string;generated_at:string;dims:Record<string,string>;cannot_infer:string[];
}
export interface Report {presentation?:Presentation;productChoices?:string[];productConfirmed?:string[];linkUnavailable?:LinkIssue;id:string;date:string;kind:Kind;title:string;verdict:Verdict;summary:string;original:string;evidence:Evidence[];next:string;scope:string;sample:boolean;images:string[];video?:Blob;audio?:Blob;sourceURL?:string;analysisLabel?:string;references?:{id:string;title:string;url:string;excerpt:string}[];numbers?:{label:string;value:string;quote:string}[];tips?:string[];answerKind?:string;contentType?:string;page?:PageSource}
export const labels:Record<Kind,string>={image:'图片',video:'视频',text:'文章',link:'链接',audio:'音频',comments:'评论'};
export const objects:Record<Kind,string>={image:'lipstick',video:'compact',text:'mascara',link:'perfume',audio:'compact',comments:'mascara'};
export const verdicts:Record<Verdict,string>={flagged:'有疑点',supported:'查到了',unclear:'还差一点'};
