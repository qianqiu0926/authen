import SwiftUI
import AVKit

struct CardPreview:View {
    var record:AnalysisReport;var action:()->Void
    var body:some View{Button(action:action){HStack(alignment:.top,spacing:14){CuteIcon(name:"image",size:48);VStack(alignment:.leading,spacing:7){HStack{TagPill(text:record.isSample ? "演示资料卡":record.verdict == .flagged ? "这几处要留意":"我的资料卡");Spacer();Text(record.createdAt,format:.dateTime.month().day()).font(.system(size:10)).foregroundStyle(Atelier.muted)};Text(ConsumerCopy.text(record.summary)).font(.system(size:15,weight:.semibold)).lineLimit(2);Text(record.kind.title+" · "+(record.saved == true ? "已收藏":"查过的内容")).font(.system(size:11)).foregroundStyle(Atelier.muted)};Image(systemName:"chevron.right").font(.system(size:11)).padding(.top,25)}.padding(16).cuteCard()}.buttonStyle(.plain).accessibilityIdentifier("资料卡-"+record.id.uuidString)}
}

struct KnowledgeCardView:View {
    let record:AnalysisReport
    @Environment(AppStore.self) private var store
    private var current:AnalysisReport{store.reports.first{$0.id==record.id} ?? record}
    var body:some View {
        SheetShell(title:record.answerKind == "advice" ? "美妆小功课":"美妆资料卡"){
            VStack(alignment:.leading,spacing:19){
                HStack{TagPill(text:record.isSample ? "演示素材":record.answerKind == "advice" ? "涂妆小技巧":record.verdict == .flagged ? "这几处要留意":record.references?.isEmpty == false ? "找到相关资料":"帮你看了看");Spacer();CuteIcon(name:"notebook",size:40)}
                Text(ConsumerCopy.text(record.summary)).font(.system(size:24,weight:.bold,design:.rounded)).lineSpacing(5).fixedSize(horizontal:false,vertical:true).accessibilityIdentifier("资料卡结论")
                if let label=record.analysisLabel,(label.contains("初查") || label.contains("只找了")){Label(ConsumerCopy.text(label),systemImage:"info.circle").font(.system(size:12)).foregroundStyle(Atelier.red)}
                if let numbers=record.numbers,!numbers.isEmpty{HStack(spacing:12){ForEach(numbers){number in metric(number.value,label:number.label)}}}
                if let tips=record.tips,!tips.isEmpty{
                    VStack(alignment:.leading,spacing:18){ForEach(Array(tips.enumerated()),id:\.offset){index,tip in HStack(alignment:.top,spacing:13){Text("0\(index+1)").font(.system(size:15,weight:.bold,design:.rounded)).foregroundStyle(Atelier.red);Text(tip).font(.system(size:15)).lineSpacing(4).fixedSize(horizontal:false,vertical:true)}}}.padding(20).frame(maxWidth:.infinity,alignment:.leading).cuteCard()
                }else if !record.nextStep.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty{
                    HStack(alignment:.top,spacing:10){Image(systemName:"lightbulb").foregroundStyle(Atelier.red);Text(ConsumerCopy.text(record.nextStep)).font(.system(size:14)).lineSpacing(4)}.padding(18).frame(maxWidth:.infinity,alignment:.leading).background(Atelier.mint,in:RoundedRectangle(cornerRadius:20))
                }
                if !record.evidence.isEmpty{
                    DisclosureGroup("展开看看 · \(record.evidence.count) 处"){
                        VStack(alignment:.leading,spacing:14){ForEach(record.evidence){e in evidence(e)}}.padding(.top,14)
                    }.font(.system(size:14,weight:.medium)).padding(17).cuteCard()
                }
                if let sources=record.references,!sources.isEmpty {
                    VStack(alignment:.leading,spacing:10){ForEach(sources){source in
                        DisclosureGroup{
                            VStack(alignment:.leading,spacing:10){Text(source.excerpt).font(.system(size:12)).foregroundStyle(Atelier.muted).textSelection(.enabled);if let url=URL(string:source.url){Link("看看原文 ↗",destination:url).font(.system(size:13))}}.padding(.top,9)
                        }label:{Label(source.title,systemImage:"link").font(.system(size:12)).lineLimit(2)}
                    }}.padding(16).cuteCard()
                }
                HStack(spacing:12){Button{store.prepareSupplement(record)}label:{Text("再补张图").font(.system(size:14,weight:.medium)).frame(maxWidth:.infinity).frame(height:52).cuteCard()};RedButton(title:current.saved == true ? "已收藏":"收藏资料卡",icon:current.saved == true ? "bookmark.fill":"bookmark"){store.toggleSave(current)}}
                DisclosureGroup("我发来的内容"){
                    VStack(alignment:.leading,spacing:12){if let name=record.videoFileName{SourceMediaPlayer(name:name,audio:record.kind == .audio)};Text(record.originalText).textSelection(.enabled);Text(record.scope).foregroundStyle(Atelier.muted);if let link=record.sourceLink,let url=URL(string:link){Link("打开原链接 ↗",destination:url)}}.font(.system(size:12)).lineSpacing(4).padding(.top,8)
                }.font(.system(size:12)).foregroundStyle(Atelier.muted)
            }
        }
    }
    private func evidence(_ e:Evidence)->some View{
        VStack(alignment:.leading,spacing:10){
            Text(ConsumerCopy.text(e.finding)).font(.system(size:15,weight:.semibold))
            if !e.quote.isEmpty{Text("“"+e.quote+"”").font(.system(size:13)).padding(12).frame(maxWidth:.infinity,alignment:.leading).background(Atelier.blush,in:RoundedRectangle(cornerRadius:12))}
            Text(ConsumerCopy.text(e.explanation)).font(.system(size:13)).lineSpacing(4).foregroundStyle(Atelier.muted)
            if let seconds=e.seconds{Label(String(format:record.kind == .audio ? "音频 %.1f 秒":"视频 %.1f 秒",seconds),systemImage:"play.circle").font(.system(size:12)).foregroundStyle(Atelier.red)}
            if let index=e.imageIndex,index>=0,index<record.images.count,let ui=UIImage(data:record.images[index]){
                DisclosureGroup("看看这张图"){
                    Image(uiImage:ui).resizable().scaledToFit().overlay{if let box=e.box,box.count==4{GeometryReader{g in RoundedRectangle(cornerRadius:4).stroke(Atelier.red,lineWidth:2).frame(width:g.size.width*box[2],height:g.size.height*box[3]).position(x:g.size.width*(box[0]+box[2]/2),y:g.size.height*(box[1]+box[3]/2))}}}.clipShape(RoundedRectangle(cornerRadius:12))
                }.font(.system(size:12))
            }
        }
    }
    private func metric(_ value:String,label:String)->some View{VStack(alignment:.leading,spacing:4){Text(value).font(.system(size:32,weight:.bold,design:.rounded)).foregroundStyle(Atelier.red);Text(label).font(.system(size:12)).foregroundStyle(Atelier.muted)}.frame(maxWidth:.infinity,alignment:.leading).padding(18).cuteCard()}
}

struct ProfileView:View {
    @Environment(AppStore.self) private var store
    @State private var query=""
    private var records:[AnalysisReport]{store.reports.filter{(store.profileSection != "知识库" || $0.saved == true) && (query.isEmpty || ($0.summary+$0.originalText).localizedCaseInsensitiveContains(query))}}
    var body:some View {
        @Bindable var store=store
        ScrollView(showsIndicators:false){VStack(alignment:.leading,spacing:20){
            HStack{Text("我的").font(.system(size:29,weight:.bold));Spacer();LeafPill();Button{store.sheet = .settings}label:{Image(systemName:"gearshape").frame(width:40,height:40).background(.white,in:Circle())}.accessibilityLabel("设置")}
            HStack(spacing:15){Image("character-bust").resizable().scaledToFill().frame(width:78,height:84,alignment:.top).clipped().background(Atelier.blush,in:RoundedRectangle(cornerRadius:25));VStack(alignment:.leading,spacing:8){Text("我的美妆档案").font(.system(size:20,weight:.bold));Text(store.social.style+" · 风格由你定义").font(.system(size:12)).foregroundStyle(Atelier.muted);HStack{TagPill(text:"\(store.reports.count) 次查阅");TagPill(text:"\(store.reports.filter{$0.saved == true}.count) 张收藏",color:Atelier.mint)}};Spacer()}.padding(17).cuteCard()
            Button{store.sheet = .room}label:{HStack{CuteIcon(name:"house",size:55);VStack(alignment:.leading,spacing:5){Text("走进我的 3D 小屋").font(.system(size:16,weight:.bold));Text("装扮自己，也装扮日常").font(.system(size:12)).foregroundStyle(Atelier.muted)};Spacer();Image(systemName:"arrow.up.right")}.padding(16).background(Atelier.blush,in:RoundedRectangle(cornerRadius:22))}.buttonStyle(.plain).accessibilityIdentifier("打开美妆小屋")
            HStack(spacing:0){ForEach(["知识库","足迹","发布","收藏动态"],id:\.self){section in Button{store.profileSection=section}label:{Text(section).font(.system(size:13,weight:store.profileSection == section ? .bold:.medium)).frame(maxWidth:.infinity).padding(.vertical,12).background(store.profileSection == section ? Atelier.red:Color.clear,in:Capsule()).foregroundStyle(store.profileSection == section ? .white:Atelier.muted)}}}.padding(4).background(Atelier.white,in:Capsule())
            if store.profileSection == "知识库" || store.profileSection == "足迹"{
                HStack{Image(systemName:"magnifyingglass");TextField("找成分、问题或资料",text:$query)}.font(.system(size:13)).padding(14).cuteCard()
                if records.isEmpty{EmptyShelf(title:store.profileSection == "知识库" ? "收藏的答案，会放在这里":"还没有查过的内容",subtitle:"去百宝箱，发来你想查的笔记或图片",icon:"notebook")}
                ForEach(records){record in CardPreview(record:record){store.open(record)}.contextMenu{Button("删除",role:.destructive){store.remove(record)}}}
            }else{
                let posts=store.social.posts.filter{store.profileSection == "发布" ? $0.isMine:$0.bookmarked}
                if posts.isEmpty{EmptyShelf(title:"还没有内容",subtitle:"去动态写一篇，或收藏喜欢的帖子",icon:"social")}
                ForEach(posts){post in Button{store.openPost(post)}label:{HStack{PostArt(post:post).frame(width:65,height:75).clipShape(RoundedRectangle(cornerRadius:12));VStack(alignment:.leading,spacing:7){Text(post.title).font(.system(size:15,weight:.semibold));Text(post.category).font(.system(size:11)).foregroundStyle(Atelier.muted)};Spacer()}.padding(14).cuteCard()}.buttonStyle(.plain)}
            }
        }.padding(22).padding(.bottom,20)}
    }
}
struct EmptyShelf:View{var title:String;var subtitle:String;var icon:String
    var body:some View{VStack(spacing:12){CuteIcon(name:icon,size:75);Text(title).font(.system(size:16,weight:.semibold));Text(subtitle).font(.system(size:12)).foregroundStyle(Atelier.muted)}.frame(maxWidth:.infinity).padding(.vertical,30)}
}

struct SourceMediaPlayer:View {
    let name:String;let audio:Bool
    @State private var player:AVPlayer?
    @State private var playing=false
    @State private var duration=1.0
    @State private var position=0.0
    var body:some View {
        VStack(spacing:12){
            if audio{
                HStack{Button{guard let player else{return};if playing{player.pause()}else{if player.currentTime().seconds>=duration-0.1{player.seek(to:.zero)};player.play()};playing.toggle()}label:{Label(playing ? "暂停":"播放原音",systemImage:playing ? "pause.circle.fill":"play.circle.fill").font(.system(size:15,weight:.medium))};Spacer();TimelineView(.periodic(from:.now,by:1)){_ in Text(String(format:"%.0f / %.0f 秒",player?.currentTime().seconds ?? 0,duration)).font(.system(size:11)).monospacedDigit()}}
                Slider(value:$position,in:0...max(1,duration),onEditingChanged:{editing in if !editing{player?.seek(to:CMTime(seconds:position,preferredTimescale:600))}}).accessibilityLabel("原音位置")
            }else{VideoPlayer(player:player).frame(height:190).clipShape(RoundedRectangle(cornerRadius:14))}
        }.padding(12).cuteCard().task{
            let url=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent(name)
            let asset=AVURLAsset(url:url);duration=(try? await asset.load(.duration).seconds) ?? 1;player=AVPlayer(playerItem:AVPlayerItem(asset:asset))
        }.onDisappear{player?.pause();playing=false}.onReceive(NotificationCenter.default.publisher(for:.AVPlayerItemDidPlayToEndTime)){_ in playing=false}
    }
}
