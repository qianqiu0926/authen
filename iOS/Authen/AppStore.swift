import SwiftUI
import Observation

@MainActor @Observable final class AppStore {
    var tab:MainTab = .toolbox
    var sheet:AppSheet?
    var material:Material?
    var report:AnalysisReport?
    var reports:[AnalysisReport]=[]
    var stage="正在读内容"
    var error:String?
    var busy=false
    var unreadCard=false
    var supplementing:AnalysisReport?
    var task:Task<Void,Never>?
    var social=CommunityState()
    var selectedPostID:UUID?
    var profileSection="知识库"
    var notice:String?
    private let archiveURL:URL
    private let socialURL:URL
    var selectedPost:BeautyPost? {social.posts.first{$0.id==selectedPostID}}

    init() {
        let dir=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0]
        archiveURL=dir.appendingPathComponent("reports.json")
        socialURL=dir.appendingPathComponent("community-v2.json")
        if let data=try? Data(contentsOf:archiveURL),let records=try? JSONDecoder().decode([AnalysisReport].self,from:data){reports=records}
        if let data=try? Data(contentsOf:socialURL),let state=try? JSONDecoder().decode(CommunityState.self,from:data){social=state}
        else {social.posts=Self.seedPosts();saveCommunity()}
        mergePublicPosts()
        if ProcessInfo.processInfo.arguments.contains("--reset-history") {reports=[];persist()}
        if ProcessInfo.processInfo.arguments.contains("--reset-community") {social=CommunityState(posts:Self.seedPosts());mergePublicPosts();saveCommunity()}
    }
    func accept(_ incoming:Material) {
        guard !busy else {notice="上一份还在查，稍等一下";return}
        var material=incoming
        if let previous=supplementing,!previous.isSample {
            material.text=[previous.originalText,material.text].filter{!$0.isEmpty}.joined(separator:"\n")
            material.images=Array((previous.images+material.images).prefix(5))
        }
        supplementing=nil;self.material=material;sheet=nil;error=nil;begin()
    }
    func sample(_ name:String="flagged") {
        let text = name=="supported" ? "这瓶保湿乳含甘油，帮助保湿。" : name=="unclear" ? "这个真的好用吗？" : "这款保湿乳，7天变白！100%无刺激，敏感肌也放心冲。"
        let renderer=ImageRenderer(content:SamplePost(kind:name).frame(width:340,height:440));renderer.scale=2
        let image=renderer.uiImage?.jpegData(compressionQuality:0.88)
        accept(Material(kind:.image,text:text,images:image.map{[$0]} ?? [],sample:name))
    }
    func begin() {
        guard let material,!busy else{return}
        error=nil;busy=true;stage="正在读"+material.kind.title;Atelier.tap()
        task=Task {
            defer {busy=false;task=nil}
            do {
                let read=try await MediaReader.read(material);try Task.checkCancellation()
                var result:AnalysisReport
                if material.sample != nil || UserDefaults.standard.object(forKey:"deepseekEnabled") as? Bool == false {
                    result=ContentReview.review(material,read:read);result.analysisLabel=material.sample != nil ? nil:"未使用 AI，只找了常见夸大说法"
                } else {
                    stage="帮你查一查"
                    do {result=try await RemoteReview.review(material,read:read)}
                    catch {
                        try Task.checkCancellation();result=ContentReview.review(material,read:read)
                        result.analysisLabel="AI 没连上，只找了常见夸大说法"
                        result.scope += " "+((error as? AuthenError)?.localizedDescription ?? "AI服务暂不可用。")
                    }
                }
                try Task.checkCancellation()
                if let video=material.videoURL {
                    let name=result.id.uuidString+"."+video.pathExtension
                    try FileManager.default.copyItem(at:video,to:archiveURL.deletingLastPathComponent().appendingPathComponent(name));result.videoFileName=name
                }
                report=result;reports.insert(result,at:0);persist();unreadCard=true;Atelier.tap()
                if tab == .toolbox && sheet == nil {sheet = .card;unreadCard=false}
            } catch is CancellationError {} catch {self.error=(error as? AuthenError)?.localizedDescription ?? "这份没读到，换张截图或重试。"}
        }
    }
    func cancel(){task?.cancel();notice="已取消"}
    func home(){supplementing=nil;tab = .toolbox}
    func prepareSupplement(_ record:AnalysisReport){supplementing=record;sheet=nil;Task{try? await Task.sleep(for:.milliseconds(350));sheet = .image}}
    func open(_ record:AnalysisReport){report=record;unreadCard=false;sheet = .card}
    func toggleSave(_ record:AnalysisReport){
        guard let i=reports.firstIndex(where:{$0.id==record.id}) else{return}
        reports[i].saved = !(reports[i].saved ?? false);report=reports[i];persist();Atelier.tap()
    }
    func remove(_ record:AnalysisReport){
        if let name=record.videoFileName{try? FileManager.default.removeItem(at:archiveURL.deletingLastPathComponent().appendingPathComponent(name))}
        reports.removeAll{$0.id==record.id};persist();if report?.id==record.id{report=nil;sheet=nil}
    }
    func deleteAll(){for r in reports{if let name=r.videoFileName{try? FileManager.default.removeItem(at:archiveURL.deletingLastPathComponent().appendingPathComponent(name))}};reports=[];report=nil;persist()}
    func persist(){do{try JSONEncoder().encode(reports).write(to:archiveURL,options:[.atomic,.completeFileProtection])}catch{self.error="记录没有保存成功，请重试。"}}
    @discardableResult func saveCommunity()->Bool{do{try JSONEncoder().encode(social).write(to:socialURL,options:[.atomic,.completeFileProtection]);return true}catch{notice="没有保存成功，请重试";return false}}
    func openPost(_ p:BeautyPost){selectedPostID=p.id;sheet = .post}
    func updatePost(_ id:UUID,_ change:(inout BeautyPost)->Void){guard let i=social.posts.firstIndex(where:{$0.id==id}) else{return};change(&social.posts[i]);saveCommunity()}
    func publish(title:String,text:String,category:String,image:Data?,sourceURL:String?,sourceTitle:String?,sourceAuthor:String?=nil,importedAt:Date?=nil){
        let p=BeautyPost(author:"我",title:title,text:text,category:category,image:image,sourceURL:sourceURL,sourceTitle:sourceTitle,importedAt:importedAt,sourceAuthor:sourceAuthor,isMine:true)
        social.posts.insert(p,at:0);saveCommunity();sheet=nil;tab = .feed;notice="已发布到本机动态"
    }
    func checkPost(_ p:BeautyPost){accept(Material(kind:.text,text:(p.sourceID != nil ? "下面整理自视频简介，这次只看这些文字，还没看完整视频：\n":"")+p.title+"\n"+p.text,images:p.sourceID == nil ? (p.image.map{[$0]} ?? []):[],link:p.sourceURL ?? ""))}
    @discardableResult func earn(_ amount:Int,reason:String,key:String)->Bool{
        guard !social.rewards.contains(key) else{return false};social.rewards.append(key);social.leaves+=amount;social.ledger.insert(LeafEntry(title:reason,amount:amount),at:0);saveCommunity();return true
    }
    func buy(_ name:String,cost:Int){
        guard !social.roomItems.contains(name),social.leaves>=cost else{return}
        social.leaves-=cost;social.roomItems.append(name);social.ledger.insert(LeafEntry(title:name,amount:-cost),at:0);saveCommunity();Atelier.tap()
    }
    func mergePublicPosts(){
        // Upgrade the feed without losing user posts, comments, likes or bookmarks.
        social.posts.removeAll{$0.isExample && !$0.isMine}
        for source in BeautySource.all.reversed(){
            if let i=social.posts.firstIndex(where:{$0.sourceID==source.id || $0.sourceURL==source.sourceURL}){
                let old=social.posts[i];var p=source.post;p.id=old.id;p.liked=old.liked;p.bookmarked=old.bookmarked;p.comments=old.comments;social.posts[i]=p
            }else{social.posts.insert(source.post,at:0)}
        }
        saveCommunity()
    }
    static func seedPosts()->[BeautyPost]{BeautySource.all.map(\.post)}

}

struct SamplePost:View {
    var kind:String
    var body:some View {
        VStack(alignment:.leading,spacing:15) {
            HStack {Circle().fill(Atelier.red.opacity(0.15)).frame(width:26,height:26).overlay(Text("A").font(.custom("Didot",size:17)));Text("AUTHEN 示例笔记").font(.system(size:12));Spacer();Image(systemName:"ellipsis")}
            Text(kind=="supported" ? "含甘油，帮助保湿。" : kind=="unclear" ? "这个真的好用吗？" : "7天变白！\n100%无刺激。")
                .font(.system(size:26,weight:.medium)).lineSpacing(6).foregroundStyle(Atelier.ink)
            ZStack {
                Rectangle().fill(Color(hex:0xEEDFD6))
                Image(kind=="unclear" ? "perfume":"compact").resizable().scaledToFit().padding(26).blur(radius:kind=="unclear" ? 12:0)
                VStack{HStack{Spacer();Text("演示素材").font(.system(size:9)).padding(5).background(Atelier.white.opacity(0.8))};Spacer()}.padding(10)
            }.frame(maxHeight:.infinity)
            HStack(spacing:10){Image(systemName:"heart");Text("23");Spacer();Image(systemName:"bubble");Image(systemName:"bookmark")}.font(.system(size:12))
        }.padding(20).background(Atelier.white).foregroundStyle(Atelier.ink)
    }
}
