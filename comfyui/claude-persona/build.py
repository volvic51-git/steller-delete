import json
POS = ("masterpiece, best quality, very aesthetic, absurdres, 1girl, solo, young woman, early 20s, "
"medium hair, soft wavy hair, auburn hair, terracotta brown hair, single ahoge, "
"amber eyes, gentle eyes, round glasses, thin frame glasses, slight smile, closed mouth, head tilt, listening, "
"star hair ornament, eight-pointed asterisk hairclip, orange hairclip, "
"cream cardigan, knit cardigan, white collared blouse, terracotta long skirt, "
"holding notebook, holding pen, open notebook, sticky notes, "
"upper body, looking at viewer, "
"cozy library, bookshelves, warm lighting, afternoon sunlight, window light, dust particles, "
"warm color palette, cream and terracotta, soft focus background, calm atmosphere")
NEG = ("lowres, worst quality, low quality, bad anatomy, bad hands, extra fingers, missing fingers, "
"jpeg artifacts, signature, watermark, text, logo, username, blurry, "
"nsfw, cleavage, revealing clothes, child, loli")
CKPT = "animagine-xl-4.0.safetensors"
SEED, STEPS, CFG, W, H = 20261123, 28, 5.0, 832, 1216

# --- API format (for /prompt endpoint) ---
api = {
 "1": {"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":CKPT}},
 "2": {"class_type":"CLIPTextEncode","inputs":{"text":POS,"clip":["1",1]},"_meta":{"title":"Positive"}},
 "3": {"class_type":"CLIPTextEncode","inputs":{"text":NEG,"clip":["1",1]},"_meta":{"title":"Negative"}},
 "4": {"class_type":"EmptyLatentImage","inputs":{"width":W,"height":H,"batch_size":4}},
 "5": {"class_type":"KSampler","inputs":{"seed":SEED,"steps":STEPS,"cfg":CFG,"sampler_name":"euler_ancestral",
       "scheduler":"normal","denoise":1.0,"model":["1",0],"positive":["2",0],"negative":["3",0],"latent_image":["4",0]}},
 "6": {"class_type":"VAEDecode","inputs":{"samples":["5",0],"vae":["1",2]}},
 "7": {"class_type":"SaveImage","inputs":{"filename_prefix":"claude_persona","images":["6",0]}},
}
json.dump(api, open("claude_persona_api.json","w"), ensure_ascii=False, indent=2)

# --- UI format (drag & drop into ComfyUI) ---
links = [  # id, from, slot, to, slot, type
 [1,1,0,5,0,"MODEL"],[2,1,1,2,0,"CLIP"],[3,1,1,3,0,"CLIP"],[4,2,0,5,1,"CONDITIONING"],
 [5,3,0,5,2,"CONDITIONING"],[6,4,0,5,3,"LATENT"],[7,5,0,6,0,"LATENT"],[8,1,2,6,1,"VAE"],[9,6,0,7,0,"IMAGE"]]
def node(i,t,pos,size,inputs,outputs,wv,title=None):
    n={"id":i,"type":t,"pos":pos,"size":size,"flags":{},"order":i-1,"mode":0,
       "inputs":inputs,"outputs":outputs,"properties":{"Node name for S&R":t},"widgets_values":wv}
    if title: n["title"]=title
    return n
I=lambda name,typ,link:{"name":name,"type":typ,"link":link}
O=lambda name,typ,ls,slot:{"name":name,"type":typ,"links":ls,"slot_index":slot}
nodes=[
 node(1,"CheckpointLoaderSimple",[40,300],[320,100],[],[O("MODEL","MODEL",[1],0),O("CLIP","CLIP",[2,3],1),O("VAE","VAE",[8],2)],[CKPT]),
 node(2,"CLIPTextEncode",[400,80],[460,260],[I("clip","CLIP",2)],[O("CONDITIONING","CONDITIONING",[4],0)],[POS],"Positive (Claude persona)"),
 node(3,"CLIPTextEncode",[400,380],[460,160],[I("clip","CLIP",3)],[O("CONDITIONING","CONDITIONING",[5],0)],[NEG],"Negative"),
 node(4,"EmptyLatentImage",[400,580],[320,110],[],[O("LATENT","LATENT",[6],0)],[W,H,4]),
 node(5,"KSampler",[900,200],[320,270],[I("model","MODEL",1),I("positive","CONDITIONING",4),I("negative","CONDITIONING",5),I("latent_image","LATENT",6)],
      [O("LATENT","LATENT",[7],0)],[SEED,"fixed",STEPS,CFG,"euler_ancestral","normal",1.0]),
 node(6,"VAEDecode",[1260,200],[210,50],[I("samples","LATENT",7),I("vae","VAE",8)],[O("IMAGE","IMAGE",[9],0)],[]),
 node(7,"SaveImage",[1500,200],[420,620],[I("images","IMAGE",9)],[],["claude_persona"]),
]
ui={"last_node_id":7,"last_link_id":9,"nodes":nodes,"links":links,"groups":[],"config":{},"extra":{},"version":0.4}
json.dump(ui, open("claude_persona_workflow.json","w"), ensure_ascii=False, indent=2)
