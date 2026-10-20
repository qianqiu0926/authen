from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, shutil, hashlib

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'output/imagegen'
OUT=ROOT/'Design/Production'
OUT.mkdir(parents=True,exist_ok=True)

def clean(im):
    im=im.convert('RGBA')
    # Some providers retain arbitrary RGB values under fully transparent pixels.
    # Preserve the alpha while removing hidden color noise.
    background=Image.new('RGBA',im.size)
    background.alpha_composite(im)
    return background

def trimmed(im,pad=12):
    im=clean(im)
    box=im.getchannel('A').point(lambda p:255 if p>24 else 0).getbbox()
    im=im.crop(box)
    canvas=Image.new('RGBA',(im.width+2*pad,im.height+2*pad))
    canvas.alpha_composite(im,(pad,pad))
    return canvas

def save(im,name,maxsize=1400):
    im=clean(im)
    im.thumbnail((maxsize,maxsize),Image.Resampling.LANCZOS)
    im.save(OUT/(name+'.png'),optimize=True)

master=clean(Image.open(RAW/'character-master-v1.png'))
save(trimmed(master),'character-full')
bust=master.crop((150,0,920,940))
save(bust,'character-bust')

# Gaze rig. Only the tiny iris areas are cleared; eyelashes and glasses stay in
# the generated illustration. Pupils are native animated elements at runtime.
rig=master.copy()
d=ImageDraw.Draw(rig)
d.polygon([(373,151),(380,148),(393,149),(400,154),(393,157),(381,159)],fill='#FFF7EC')
d.polygon([(433,138),(440,132),(450,132),(457,137),(449,143),(438,145)],fill='#FFF7EC')
save(rig.crop((150,0,920,940)),'character-gaze')

states=clean(Image.open(RAW/'character-states-v1.png'))
for idx,name in enumerate(['reading','presenting','curious']):
    x0=round(idx*states.width/3);x1=round((idx+1)*states.width/3)
    cut=states.crop((x0,0,x1,states.height))
    save(trimmed(cut),'character-'+name)
    save(trimmed(cut.crop((0,0,cut.width,round(cut.height*.57)))),'character-'+name+'-bust')

machine=trimmed(Image.open(RAW/'shredder-v1.png'),18)
save(machine,'shredder')
objects=clean(Image.open(RAW/'vanity-objects-v1.png'))
for idx,name in enumerate(['lipstick','compact','mascara','perfume']):
    x=(idx%2)*objects.width//2;y=(idx//2)*objects.height//2
    crop=objects.crop((x,y,x+objects.width//2,y+objects.height//2))
    save(trimmed(crop),name,800)

# Native brand typography is kept editable. This icon is a crop of the actual
# generated character, with AUTHEN's initial as a native text treatment.
icon=Image.new('RGB',(1024,1024),'#F7F2EB')
art=master.crop((195,0,755,640));art.thumbnail((920,1000),Image.Resampling.LANCZOS)
icon.paste(art,((1024-art.width)//2,70),art)
icon.save(OUT/'app-icon.png')

for p in RAW.glob('*.png'):
    shutil.copy2(p,ROOT/'Design/Generated'/p.name)
manifest=[]
for p in sorted(OUT.glob('*.png')):
    im=Image.open(p)
    manifest.append({'name':p.name,'width':im.width,'height':im.height,'mode':im.mode,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(OUT/'manifest.json').write_text(json.dumps({'method':'gpt-image-2 via imagegen bundled CLI; local crop/alpha preservation and eye rig','assets':manifest},ensure_ascii=False,indent=2))

canvas=Image.new('RGB',(1500,1200),'#F7F2EB')
names=['character-bust','shredder','character-reading-bust','character-presenting-bust','lipstick','compact','mascara','perfume']
d=ImageDraw.Draw(canvas)
for i,name in enumerate(names):
    im=Image.open(OUT/(name+'.png'));im.thumbnail((325,500))
    x=(i%4)*375+(375-im.width)//2;y=(i//4)*600+50
    canvas.paste(im,(x,y),im)
    d.text(((i%4)*375+20,(i//4)*600+15),name,fill='#B52B32')
canvas.save(ROOT/'QA/production-art-board.jpg')
print(f'Prepared {len(manifest)} production assets.')
