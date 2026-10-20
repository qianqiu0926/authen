import SwiftUI
import SceneKit

@MainActor @Observable final class RoomEditor {
    var layout=RoomLayout.initial
    var selected:String?="vanity"
    var editing=false
    var history:[RoomLayout]=[]
    var saved=RoomLayout.initial
    var message="轻扫转动视角，双指缩放"
    var cameraReset=0
    var dirty:Bool{layout != saved}
    var piece:RoomPiece?{layout.pieces.first{$0.id==selected && $0.visible}}
    private var dragStart:RoomLayout?
    func load(_ value:RoomLayout){layout=value;saved=value;history=[]}
    func checkpoint(){history.append(layout);if history.count>30{history.removeFirst()}}
    func undo(){if let old=history.popLast(){layout=old;message="已撤销上一步"}}
    func update(_ change:(inout RoomPiece)->Void){
        guard let i=layout.pieces.firstIndex(where:{$0.id==selected}) else{return}
        var p=layout.pieces[i];change(&p);p=RoomLayout.bounded(p)
        guard !layout.overlaps(p) else{message="这里有家具，换个位置试试";return}
        checkpoint();layout.pieces[i]=p;message="摆好后记得保存"
    }
    func startDrag(){dragStart=layout}
    func drag(x:Float,z:Float){
        guard let i=layout.pieces.firstIndex(where:{$0.id==selected})else{return}
        var p=layout.pieces[i];p.x=x;p.z=z;p=RoomLayout.bounded(p)
        if !layout.overlaps(p){layout.pieces[i]=p;message="松手放下，保存后下次还在"}else{message="这里有家具，换个位置试试"}
    }
    func endDrag(){if let old=dragStart,old != layout{history.append(old)};dragStart=nil}
    func choose(_ id:String){selected=id;editing=true;message="拖动家具，或用下方按钮微调"}
    func toggle(_ id:String){
        guard let i=layout.pieces.firstIndex(where:{$0.id==id})else{return}
        if !layout.pieces[i].visible {
            var restored=layout.pieces[i];restored.visible=true
            if layout.overlaps(restored){
                var available:RoomPiece?
                search:for z in stride(from:Float(1.8),through:-1.8,by:-0.4){for x in stride(from:Float(2.6),through:-2.6,by:-0.4){restored.x=x;restored.z=z;restored=RoomLayout.bounded(restored);if !layout.overlaps(restored){available=restored;break search}}}
                guard let free=available else{message="腾点位置再放回来吧";return};restored=free
            }
            checkpoint();layout.pieces[i]=restored;selected=id
        }else{checkpoint();layout.pieces[i].visible=false}
    }
    func add(_ kind:String){
        if let existing=layout.pieces.first(where:{$0.kind==kind}){if !existing.visible{toggle(existing.id)};choose(existing.id);return}
        var p=RoomPiece(id:kind,kind:kind,x:1.8,z:0)
        for z in stride(from:Float(1.8),through:-1.8,by:-0.4){for x in stride(from:Float(2.6),through:-2.6,by:-0.4){p.x=x;p.z=z;p=RoomLayout.bounded(p);if !layout.overlaps(p){checkpoint();layout.pieces.append(p);choose(p.id);return}}}
        message="先收起一件家具，腾点位置吧"
    }
    func style(_ name:String){guard layout.style != name else{return};checkpoint();layout.style=name}
    func reset(){checkpoint();layout=RoomLayout.initial;selected="vanity";cameraReset+=1;message="已恢复初始布置，可撤销"}
}

struct DressingRoomView:View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var editor=RoomEditor()
    @State private var confirmReset=false
    @State private var confirmLeave=false
    @State private var section="家具"
    var body:some View {
        NavigationStack {
            GeometryReader{geo in
                VStack(spacing:0){
                    ZStack(alignment:.top){
                        RoomCanvas(editor:editor).accessibilityIdentifier("3D小屋")
                        HStack(spacing:8){
                            Text(editor.layout.style+" · 私人梳妆间").font(.system(size:11,weight:.medium)).padding(10).background(.white.opacity(0.86),in:Capsule())
                            Spacer()
                            Button{editor.cameraReset+=1}label:{Image(systemName:"viewfinder").frame(width:35,height:35).background(.white.opacity(0.9),in:Circle())}.accessibilityLabel("回到正面")
                        }.padding(16)
                    }.frame(height:max(300,min(430,geo.size.height*0.53)))
                    ScrollView(showsIndicators:false){VStack(alignment:.leading,spacing:14){
                        HStack{VStack(alignment:.leading,spacing:4){Text(editor.editing ? "让喜欢，各就各位":"我的美妆小屋").font(.system(size:21,weight:.bold));Text(editor.message).font(.system(size:11)).foregroundStyle(Atelier.muted).accessibilityIdentifier("小屋提示")};Spacer();Button(editor.editing ? "看全景":"布置小屋"){editor.editing.toggle();editor.message=editor.editing ? "点选家具，再拖动或旋转":"轻扫转动视角，双指缩放"}.font(.system(size:12,weight:.bold)).padding(.horizontal,14).padding(.vertical,11).background(editor.editing ? Atelier.ink:Atelier.red,in:Capsule()).foregroundStyle(.white).accessibilityIdentifier("布置模式")}
                        if editor.editing{editorPanel}
                        else{HStack(spacing:10){roomStat("8+","家具装饰");roomStat("3","房间配色");roomStat("360°","自由摆放")}}
                        HStack{ForEach(["家具","配色"],id:\.self){value in Button{section=value}label:{Text(value).font(.system(size:14,weight:.semibold)).padding(.bottom,7).overlay(alignment:.bottom){if section==value{Capsule().fill(Atelier.red).frame(height:3)}}}.foregroundStyle(section==value ? Atelier.red:Atelier.muted)};Spacer();Button{editor.undo()}label:{Label("撤销",systemImage:"arrow.uturn.backward")}.disabled(editor.history.isEmpty).font(.system(size:12));Button{confirmReset=true}label:{Image(systemName:"arrow.counterclockwise")}.accessibilityLabel("重置小屋")}
                        if section=="家具"{furnitureTray}else{palette}
                    }.padding(18).padding(.bottom,10)}.background(Atelier.paper)
                }
            }.background(Color(hex:0xEEDFD5)).navigationTitle("美妆小屋").navigationBarTitleDisplayMode(.inline)
                .toolbar{
                    ToolbarItem(placement:.topBarLeading){Button("关闭"){if editor.dirty{confirmLeave=true}else{dismiss()}}}
                    ToolbarItem(placement:.topBarTrailing){Button(editor.dirty ? "保存布置":"已保存"){save()}.fontWeight(.bold).disabled(!editor.dirty).accessibilityIdentifier("保存布置")}
                }
                .confirmationDialog("恢复最初的家具摆放？",isPresented:$confirmReset,titleVisibility:.visible){Button("恢复初始布置"){editor.reset()};Button("取消",role:.cancel){}}
                .confirmationDialog("这次布置还没保存",isPresented:$confirmLeave,titleVisibility:.visible){Button("保存并离开"){if save(){dismiss()}};Button("放弃这次修改",role:.destructive){dismiss()};Button("继续布置",role:.cancel){}}
        }.interactiveDismissDisabled(editor.dirty).onAppear{
            var layout=store.social.roomLayout ?? RoomLayout.initial
            if store.social.roomLayout == nil{layout.style=store.social.style}
            editor.load(layout)
        }
    }
    @discardableResult private func save()->Bool{store.social.roomLayout=editor.layout;store.social.style=editor.layout.style;guard store.saveCommunity() else{return false};editor.saved=editor.layout;editor.message="布置已保存，下次回家还是这样";Atelier.tap();return true}
    private func roomStat(_ value:String,_ label:String)->some View{VStack(alignment:.leading,spacing:4){Text(value).font(.system(size:18,weight:.semibold,design:.rounded));Text(label).font(.system(size:10)).foregroundStyle(Atelier.muted)}.frame(maxWidth:.infinity,alignment:.leading).padding(12).cuteCard()}
    private var editorPanel:some View {
        VStack(spacing:10){
            if let piece=editor.piece{
                HStack{Text(piece.spec.title).font(.system(size:15,weight:.bold));Text("\(Int(piece.angle))°").font(.system(size:12,weight:.medium,design:.monospaced)).foregroundStyle(Atelier.red).accessibilityIdentifier("家具角度");Spacer();Text(String(format:"X %.1f · Y %.1f",piece.x,piece.z)).font(.system(size:10,design:.monospaced)).foregroundStyle(Atelier.muted).accessibilityIdentifier("家具位置")}
                HStack(spacing:8){
                    control("rotate.left","左转"){editor.update{$0.angle-=45}}
                    control("rotate.right","右转"){editor.update{$0.angle+=45}}
                    Spacer(minLength:2)
                    control("arrow.left","向左移动"){editor.update{$0.x-=0.2}}
                    control("arrow.right","向右移动"){editor.update{$0.x+=0.2}}
                    control("arrow.up","向后移动"){editor.update{$0.z-=0.2}}
                    control("arrow.down","向前移动"){editor.update{$0.z+=0.2}}
                    control("archivebox","收起家具"){editor.toggle(piece.id)}
                }
            }else{Text("从下面选一件家具，开始布置").font(.system(size:13)).frame(maxWidth:.infinity)}
        }.padding(13).cuteCard()
    }
    private func control(_ symbol:String,_ label:String,action:@escaping()->Void)->some View{Button(action:action){Image(systemName:symbol).font(.system(size:15,weight:.medium)).frame(width:33,height:36).background(Atelier.blush.opacity(0.7),in:RoundedRectangle(cornerRadius:10))}.accessibilityLabel(label)}
    private var furnitureTray:some View {
        LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:8),count:4),spacing:9){ForEach(RoomFurniture.catalog){spec in
            let placed=editor.layout.pieces.first{$0.kind==spec.id}
            let locked=spec.id=="lipstick" && !store.social.roomItems.contains("口红摆件")
            Button{
                if locked{if store.social.leaves>=10{store.buy("口红摆件",cost:10);editor.add(spec.id)}else{editor.message="游乐场完成一关，得 10 片小叶子"}}
                else{editor.add(spec.id)}
            }label:{VStack(spacing:6){Image(systemName:spec.symbol).font(.system(size:23,weight:.light)).frame(height:27);Text(spec.title).font(.system(size:11,weight:.medium));Text(locked ? "10 片叶子":placed?.visible == true ? "已摆放":"放进小屋").font(.system(size:9)).foregroundStyle(Atelier.muted)}.frame(maxWidth:.infinity).padding(.vertical,12).background(editor.selected==spec.id && editor.editing ? Atelier.blush:Atelier.white,in:RoundedRectangle(cornerRadius:17)).overlay(RoundedRectangle(cornerRadius:17).stroke(editor.selected==spec.id && editor.editing ? Atelier.red:Atelier.line,lineWidth:1))}.buttonStyle(.plain).accessibilityIdentifier("家具-"+spec.id)
        }}
    }
    private var palette:some View{HStack{ForEach(["樱桃红","奶油白","玫瑰粉"],id:\.self){name in Button{editor.style(name)}label:{VStack(spacing:9){Circle().fill(name=="樱桃红" ? Atelier.red:name=="奶油白" ? Color(hex:0xD3B996):Color(hex:0xD18C9E)).frame(width:35,height:35).overlay{if editor.layout.style==name{Image(systemName:"checkmark").foregroundStyle(.white)}};Text(name).font(.system(size:12))}.frame(maxWidth:.infinity).padding(15).cuteCard()}}}}
}

struct RoomCanvas:UIViewRepresentable {
    var editor:RoomEditor
    func makeCoordinator()->Coordinator{Coordinator(editor)}
    func makeUIView(context:Context)->SCNView{
        let view=SCNView();view.backgroundColor=UIColor(red:0.93,green:0.88,blue:0.84,alpha:1)
        view.antialiasingMode = .multisampling4X;view.preferredFramesPerSecond=60
        view.scene=AtelierRoomScene.make(editor.layout);view.pointOfView=view.scene?.rootNode.childNode(withName:"camera",recursively:false)
        view.isPlaying=false;view.autoenablesDefaultLighting=false
        let c=context.coordinator;c.view=view
        view.addGestureRecognizer(UITapGestureRecognizer(target:c,action:#selector(Coordinator.tap(_:))))
        view.addGestureRecognizer(UIPanGestureRecognizer(target:c,action:#selector(Coordinator.pan(_:))))
        view.addGestureRecognizer(UIPinchGestureRecognizer(target:c,action:#selector(Coordinator.pinch(_:))))
        c.lastLayout=editor.layout;c.resetID=editor.cameraReset
        return view
    }
    func updateUIView(_ view:SCNView,context:Context){context.coordinator.sync()}
    @MainActor final class Coordinator:NSObject {
        var editor:RoomEditor;weak var view:SCNView?;var lastLayout:RoomLayout?;var resetID=0
        var yaw:Float=0.64;var elevation:Float=0.60;var zoom:Double=4.60
        var dragging=false;var offset=SCNVector3Zero;var lastPan:CGPoint = .zero
        init(_ editor:RoomEditor){self.editor=editor}
        func sync(){
            guard let view else{return}
            if lastLayout?.style != editor.layout.style {
                view.scene=AtelierRoomScene.make(editor.layout);view.pointOfView=view.scene?.rootNode.childNode(withName:"camera",recursively:false);setCamera()
            } else if let root=view.scene?.rootNode {
                for p in editor.layout.pieces {
                    var node=root.childNode(withName:"piece:"+p.id,recursively:false)
                    if node == nil {node=AtelierRoomScene.furniture(p,style:editor.layout.style);root.addChildNode(node!)}
                    node?.position=SCNVector3(p.x,0,p.z);node?.eulerAngles.y=p.angle * .pi/180;node?.isHidden = !p.visible
                }
                for node in root.childNodes where node.name?.hasPrefix("piece:")==true {if !editor.layout.pieces.contains(where:{"piece:"+$0.id==node.name}){node.removeFromParentNode()}}
            }
            lastLayout=editor.layout
            if resetID != editor.cameraReset{yaw=0.64;elevation=0.60;zoom=4.60;resetID=editor.cameraReset;setCamera()}
            view.scene?.rootNode.childNode(withName:"selection",recursively:false)?.removeFromParentNode()
            if editor.editing,let p=editor.piece {
                let shape=SCNBox(width:CGFloat(p.spec.width)+0.1,height:0.018,length:CGFloat(p.spec.depth)+0.1,chamferRadius:0.13)
                let m=SCNMaterial();m.diffuse.contents=UIColor(red:0.9,green:0.27,blue:0.32,alpha:0.24);m.lightingModel = .constant;m.isDoubleSided=true;shape.materials=[m]
                let n=SCNNode(geometry:shape);n.name="selection";n.position=SCNVector3(p.x,0.045,p.z);n.eulerAngles.y=p.angle * .pi/180;n.castsShadow=false
                let edge=AtelierRoomScene.material(UIColor(hex:0xB52B32),rough:1);edge.lightingModel = .constant
                let w=p.spec.width/2+0.08,d=p.spec.depth/2+0.08
                for sign:Float in [-1,1]{AtelierRoomScene.rod(SCNVector3(-w,0.06,sign*d),SCNVector3(w,0.06,sign*d),radius:0.012,mat:edge,parent:n);AtelierRoomScene.rod(SCNVector3(sign*w,0.06,-d),SCNVector3(sign*w,0.06,d),radius:0.012,mat:edge,parent:n)}
                view.scene?.rootNode.addChildNode(n)
            }
            view.setNeedsDisplay()
        }
        func hit(_ point:CGPoint)->String?{
            guard let view else{return nil}
            for hit in view.hitTest(point,options:[.searchMode:SCNHitTestSearchMode.all.rawValue]){
                var n:SCNNode?=hit.node
                while let node=n {if let name=node.name,name.hasPrefix("piece:"){return String(name.dropFirst(6))};n=node.parent}
            };return nil
        }
        func floorPoint(_ point:CGPoint)->SCNVector3? {
            guard let view else{return nil}
            let near=view.unprojectPoint(SCNVector3(Float(point.x),Float(point.y),0)),far=view.unprojectPoint(SCNVector3(Float(point.x),Float(point.y),1))
            let dy=far.y-near.y;guard abs(dy)>0.0001 else{return nil}
            let t = -near.y/dy
            return SCNVector3(near.x+(far.x-near.x)*t,0,near.z+(far.z-near.z)*t)
        }
        @objc func tap(_ recognizer:UITapGestureRecognizer){guard editor.editing,let id=hit(recognizer.location(in:view))else{return};editor.choose(id);sync()}
        @objc func pan(_ g:UIPanGestureRecognizer){
            let location=g.location(in:view),translation=g.translation(in:view)
            if g.state == .began {
                lastPan=translation;dragging=false
                if editor.editing,let id=hit(location),let pos=floorPoint(location){editor.choose(id);if let p=editor.piece{offset=SCNVector3(p.x-pos.x,0,p.z-pos.z);dragging=true;editor.startDrag()}}
            } else if g.state == .changed {
                if dragging,let pos=floorPoint(location){editor.drag(x:pos.x+offset.x,z:pos.z+offset.z);sync()}
                else{yaw=max(0.12,min(1.35,yaw-Float(translation.x-lastPan.x)*0.006));elevation=max(0.32,min(1.05,elevation+Float(translation.y-lastPan.y)*0.004));setCamera()}
                lastPan=translation
            }else if g.state == .ended || g.state == .cancelled{if dragging{editor.endDrag()};dragging=false}
        }
        @objc func pinch(_ g:UIPinchGestureRecognizer){zoom=max(2.8,min(6.4,zoom/Double(g.scale)));g.scale=1;setCamera()}
        func setCamera(){guard let camera=view?.pointOfView else{return};let r:Float=13;camera.position=SCNVector3(sin(yaw)*cos(elevation)*r,1.15+sin(elevation)*r,cos(yaw)*cos(elevation)*r);camera.look(at:SCNVector3(0,1.15,0));camera.camera?.orthographicScale=zoom;view?.setNeedsDisplay()}
    }
}
