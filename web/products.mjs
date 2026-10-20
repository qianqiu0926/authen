import catalog from './product-catalog.json' with {type:'json'};

export {catalog};
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function occurrence(text, alias) {
  // English names may touch Chinese, but must not match inside another Latin word.
  const latin = /^[a-z]/i.test(alias);
  const regex = new RegExp((latin ? '(?<![a-z])' : '') + escape(alias).replace(/\s+/g,'\\s*') + (latin ? '(?![a-z])' : ''), 'i');
  return regex.exec(text);
}
export function productText(text = '') {
  // Parsed public comments are separate evidence, not the post's featured products.
  return text.split(/\n评价\d+[（：:]/)[0].replace(/https?:\/\/[^\s<>]+/gi,' ').slice(0,16000);
}
export function matchProducts(text = '', {sample = false} = {}) {
  if (sample) return [];
  text = productText(text);
  const brands = catalog.brands.filter(b => b.aliases.some(a => occurrence(text,a)));
  const matches = [];
  for (const p of catalog.products) {
    const found = p.aliases.map(a => occurrence(text,a)).find(Boolean);
    if (!found || (p.exclude && new RegExp(p.exclude,'i').test(text))) continue;
    const nearby = text.slice(Math.max(0,found.index-65),found.index+found[0].length+65);
    const brand = catalog.brands.find(b=>b.id===p.brand);
    const hasBrand = brand.aliases.some(a=>occurrence(nearby,a));
    if (p.requireBrand && !hasBrand) continue;
    const otherBrand = catalog.brands.some(b=>b.id!==p.brand && b.aliases.some(a=>occurrence(nearby,a)));
    const editionKnown=!p.editionPattern || new RegExp(p.editionPattern,'i').test(nearby);
    matches.push({id:p.id,quote:found[0],needsConfirm:!hasBrand || otherBrand || !editionKnown,kind:'product'});
  }
  for (const b of brands) {
    if(matches.some(m=>catalog.products.find(p=>p.id===m.id)?.brand===b.id)) continue;
    // The group name alone is not a specific Paris product brand mention.
    if(b.id==='loreal-paris' && /欧莱雅(?:集团|旗下|公司)/.test(text) && !/巴黎欧莱雅/.test(text)) continue;
    const hit=b.aliases.map(a=>occurrence(text,a)).filter(Boolean).sort((a,b)=>a.index-b.index)[0];
    const quote=text.slice(hit.index,hit.index+70).split(/[\n。！？]/)[0].trim();
    matches.push({id:'brand:'+b.id,quote,needsConfirm:false,kind:'brand'});
  }
  return matches;
}
export function productEntry(id) {
  const product = catalog.products.find(p=>p.id===id);
  const brand = catalog.brands.find(b=>b.id===(product?.brand || id.replace(/^brand:/,'')));
  if (!brand || (!product && id!=='brand:'+brand.id)) return null;
  return {id,product,brand};
}
export function reportProducts(report) {
  if(report.sample) return [];
  const automatic=matchProducts(report.original || '');
  const matches = Array.isArray(report.productChoices)
    ? [...new Set(report.productChoices)].slice(0,20).filter(id=>typeof id==='string').map(id=>automatic.find(m=>m.id===id)||{id,quote:'你选择的产品',needsConfirm:true,kind:id.startsWith('brand:')?'brand':'product'})
    : automatic;
  return matches.flatMap(m=>{const entry=productEntry(m.id);return entry ? [{...entry,...m,needsConfirm:m.needsConfirm && !report.productConfirmed?.includes(m.id)}] : []});
}
export function productReferences(text) {
  return matchProducts(text).filter(m=>!m.needsConfirm && m.kind==='product').slice(0,2).map(m=>{
    const p=catalog.products.find(p=>p.id===m.id);
    return {id:'product-'+p.id,title:p.officialName+' · 品牌官网说明（'+catalog.checkedAt+'整理）',url:p.url,excerpt:p.reference,retrievedAt:catalog.checkedAt,sourceType:'brand'};
  });
}
