"""Local CPU transcription. Emits only the transcript JSON, never user audio or keys in logs."""
import json,sys,os
from pathlib import Path
from faster_whisper import WhisperModel
import av
if len(sys.argv)>1:
    with av.open(sys.argv[1]) as c:
        if not c.streams.audio or not c.duration or c.duration/av.time_base>61:
            raise ValueError("Audio length invalid")
root=Path(__file__).resolve().parent.parent
model=WhisperModel(os.environ.get('AUTHEN_WHISPER_MODEL','small'),device='cpu',compute_type='int8',download_root=str(root/'models'/'whisper'),cpu_threads=int(os.environ.get("AUTHEN_AUDIO_THREADS","2")),local_files_only=len(sys.argv)>1)
if len(sys.argv)==1:
    print(json.dumps({'ready':True}));sys.exit(0)
segments,info=model.transcribe(sys.argv[1],language=None,beam_size=5,initial_prompt='美妆、护肤、成分、浓度、烟酰胺、保湿霜、单次使用、含水量、敏感肌。',vad_filter=True,condition_on_previous_text=False)
items=[{'text':s.text.strip(),'start':round(s.start,2),'end':round(s.end,2)} for s in segments if s.text.strip()]
print(json.dumps({'text':'\n'.join(s['text'] for s in items),'segments':items},ensure_ascii=False))
