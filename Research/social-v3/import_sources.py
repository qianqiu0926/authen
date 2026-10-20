import json, pathlib, urllib.request, datetime, hashlib, subprocess
root=pathlib.Path(__file__).resolve().parents[2]
research=root/'Research/social-v3'
assets=root/'iOS/Authen/Assets.xcassets'
entries=[
 ('3ce-video','3CE 口红怎么涂出柔和渐变？','原视频简介给了三步：\n① 把 #212 MOON 涂在嘴唇内侧。\n② 轻轻抿唇，让颜色贴合。\n③ 用棉签、手指或唇刷，从内向外晕开。\n\n重点是内深外浅，唇缘留得柔和一点。','唇妆教程'),
 ('NiX2oOBHZek','3CE 丝绒唇釉，23 个色号怎么选？','作者整理了 3CE Velvet Lip Tints 的 23 色上唇试色，简介列有 Taupe、Daffodil、Going Right 等色号。\n\n适合先对照色调，再点开原视频看上唇效果。不同光线和原生唇色会影响显色。','试色功课'),
 ('VgUuMbePROw','想要柔雾唇？看看这份晕染灵感','这期视频围绕 blotted / gradient lips 展开。作者在产品清单里列了 3CE Velvet Lip Tints、NYX 唇霜与 Fenty 唇蜜。\n\n喜欢模糊唇缘和柔和渐变，可以从这期找灵感。具体手法请看原视频。','唇妆教程'),
 ('h5pv7vhH2ks','一支口红，试试四种渐变唇','sichenmakeupholic 的入门视频主题是四种渐变唇，面向喜欢韩式渐变效果的人。\n\n简介列出 Revlon、M·A·C、Lancôme 等产品。这里保留原视频封面，点开看完整示范。','唇妆教程'),
 ('R7w6bTLMfvM','3CE 丝绒系列，上唇再比较','这期内容是 Stylenanda 3CE Velvet Lip Tint 试色。作者在简介中说明，这是回应观众对 3CE 产品的提问。\n\n挑口红时可以把它作为色调参考，具体色号和上唇效果请看原视频。','试色功课')]
manifest=[]
for filename,title,summary,category in entries:
 d=json.load(open(research/(filename+'.json')))
 # Verify metadata with the public oEmbed endpoint. Never infer original authors.
 url=d['webpage_url']
 req=urllib.request.Request('https://www.youtube.com/oembed?format=json&url='+urllib.parse.quote(url),headers={'User-Agent':'AUTHEN prototype source reader'})
 with urllib.request.urlopen(req,timeout=30) as response: o=json.load(response)
 assert o['author_name']==d['uploader'] and o['title']==d['title']
 asset='youtube-'+d['id']; dest=assets/(asset+'.imageset'); dest.mkdir(parents=True,exist_ok=True)
 # Use the original thumbnail URL returned by YouTube. Keep the source bytes intact.
 search=[json.loads(line) for name in ['search.jsonl','search-3ce.jsonl'] for line in open(research/name)]
 result=next(item for item in search if item['id']==d['id'])
 thumb=max(result['thumbnails'],key=lambda image:image.get('width',0))['url']
 with urllib.request.urlopen(thumb,timeout=30) as response: data=response.read()
 (dest/'original.jpg').write_bytes(data)
 (dest/'Contents.json').write_text(json.dumps({'images':[{'filename':'original.jpg','idiom':'universal'}],'info':{'author':'xcode','version':1}}))
 entry=dict(id=d['id'],title=title,summary=summary,category=category,asset=asset,sourceURL=url,sourceTitle=d['title'],author=d['uploader'],publishedAt=datetime.datetime.strptime(d['upload_date'],'%Y%m%d').strftime('%Y-%m-%d'),duration=f"{d['duration']//60}:{d['duration']%60:02d}",thumbnailURL=thumb,thumbnailSHA256=hashlib.sha256(data).hexdigest(),retrievedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),basis='原视频标题与公开简介；未下载完整视频，非逐字字幕',description=d['description'])
 manifest.append(entry)
 print(d['id'],d['uploader'],len(data),'bytes')
(research/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
(root/'iOS/Authen/BeautySources.json').write_text(json.dumps([{k:v for k,v in item.items() if k!='description'} for item in manifest],ensure_ascii=False,indent=2))
