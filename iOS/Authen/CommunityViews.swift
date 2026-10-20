import SwiftUI
import PhotosUI

struct FeedView:View {
    @Environment(AppStore.self) private var store
    @State private var category="全部"
    @State private var query=""
    @State private var newest=false
    private var posts:[BeautyPost]{store.social.posts.filter{(category == "全部" || $0.category==category) && (query.isEmpty || ($0.title+$0.text).localizedCaseInsensitiveContains(query))}.sorted{if newest{return $0.createdAt>$1.createdAt};if $0.isMine != $1.isMine{return $0.isMine};return false}}
    var body:some View {
        ScrollView(showsIndicators:false){VStack(alignment:.leading,spacing:17){
            HStack{VStack(alignment:.leading,spacing:4){Text("BEAUTY TOGETHER").font(.system(size:10,weight:.bold)).tracking(2).foregroundStyle(Atelier.red);Text("动态").font(.system(size:29,weight:.bold))};Spacer();Button{store.sheet = .compose}label:{HStack(spacing:6){Image(systemName:"plus");Text("发动态")}.font(.system(size:13,weight:.bold)).padding(.horizontal,15).padding(.vertical,12).foregroundStyle(.white).background(Atelier.red,in:Capsule())}.accessibilityIdentifier("发动态")}
            HStack{Image(systemName:"magnifyingglass");TextField("搜唇妆、底妆、鉴真课堂",text:$query)}.font(.system(size:13)).padding(14).cuteCard()
            HStack(spacing:12){CuteIcon(name:"social",size:53);VStack(alignment:.leading,spacing:5){Text("把好看的妆，变成自己的灵感").font(.system(size:16,weight:.bold));Text("YouTube 教程精选 · 保留原作者与原图").font(.system(size:11)).foregroundStyle(Atelier.muted)};Spacer(minLength:0)}.padding(14).background(Atelier.blush,in:RoundedRectangle(cornerRadius:23))
            ScrollView(.horizontal,showsIndicators:false){HStack(spacing:8){ForEach(["全部","鉴真课堂","唇妆教程","试色功课","美妆日常","鉴真心得"],id:\.self){item in Button{category=item}label:{Text(item).font(.system(size:12,weight:.medium)).padding(.horizontal,14).padding(.vertical,9).background(category == item ? Atelier.ink:Atelier.white,in:Capsule()).foregroundStyle(category == item ? .white:Atelier.ink)}}}}
            HStack{Text("发现美一点的日常").font(.system(size:14,weight:.semibold));Spacer();Button{newest.toggle()}label:{HStack(spacing:4){Text(newest ? "按发布时间":"精选内容");Image(systemName:"arrow.up.arrow.down")}.font(.system(size:11)).foregroundStyle(Atelier.muted)}}
            if posts.isEmpty{EmptyShelf(title:"还没有相关动态",subtitle:"换个关键词，或分享你的发现",icon:"social")}
            HStack(alignment:.top,spacing:12){ForEach(0..<2){column in VStack(spacing:14){ForEach(Array(posts.enumerated()).filter{$0.offset%2==column},id:\.element.id){index,post in FeedTile(post:post,tall:index%3==0)}}.frame(maxWidth:.infinity)}}
        }.padding(.horizontal,20).padding(.top,12).padding(.bottom,28)}
    }
}
struct FeedTile:View {
    let post:BeautyPost;var tall:Bool
    @Environment(AppStore.self) private var store
    var body:some View {
        VStack(alignment:.leading,spacing:0){
            Button{store.openPost(post)}label:{PostArt(post:post).frame(height:tall ? 191:150).clipped().overlay(alignment:.topLeading){if post.isExample{TagPill(text:"示例").padding(9)}else if post.sourceURL != nil{TagPill(text:post.platform ?? "分享链接").padding(9)}}}.buttonStyle(.plain)
            VStack(alignment:.leading,spacing:9){Button{store.openPost(post)}label:{Text(post.title).font(.system(size:14,weight:.semibold)).lineLimit(3).multilineTextAlignment(.leading).fixedSize(horizontal:false,vertical:true).frame(maxWidth:.infinity,alignment:.leading)}.buttonStyle(.plain);HStack{Text(post.author).font(.system(size:10)).foregroundStyle(Atelier.muted).lineLimit(1);Spacer();Button{store.updatePost(post.id){$0.liked.toggle()};Atelier.tap()}label:{Image(systemName:post.liked ? "heart.fill":"heart").font(.system(size:14)).foregroundStyle(post.liked ? Atelier.red:Atelier.muted)}.accessibilityLabel("喜欢-"+post.title)}}.padding(12)
        }.background(Atelier.white).clipShape(RoundedRectangle(cornerRadius:20)).overlay(RoundedRectangle(cornerRadius:20).stroke(Atelier.line,lineWidth:1))
    }
}
struct PostArt:View {
    var post:BeautyPost
    var body:some View {
        GeometryReader{g in ZStack{
            (post.category == "鉴真心得" ? Atelier.mint:Atelier.blush)
            if let data=post.image,let ui=UIImage(data:data){Image(uiImage:ui).resizable().scaledToFill().frame(width:g.size.width,height:g.size.height).clipped()}
            else if let asset=post.asset {
                Image(asset).resizable().scaledToFill().frame(width:g.size.width,height:g.size.height).clipped()
            }else{VStack(spacing:12){CuteIcon(name:"notebook",size:66);Text(String(post.title.prefix(20))).font(.system(size:20,weight:.bold)).multilineTextAlignment(.center)}.padding(18)}
        }}
    }
}
struct PostDetailView:View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var comment=""
    var body:some View{SheetShell(title:"美妆动态"){
        if let post=store.selectedPost{VStack(alignment:.leading,spacing:18){
            HStack{Circle().fill(Atelier.blush).frame(width:36,height:36).overlay(Text(String(post.author.prefix(1))).font(.system(size:14,weight:.bold)));VStack(alignment:.leading,spacing:3){Text(post.author).font(.system(size:14,weight:.semibold));Text(post.isExample ? "团队编写的社区示例":post.publishedAt.map{"YouTube · "+$0} ?? post.createdAt.formatted(date:.abbreviated,time:.shortened)).font(.system(size:10)).foregroundStyle(Atelier.muted)};Spacer();TagPill(text:post.category)}
            PostArt(post:post).frame(height:post.sourceID != nil ? 210:280).clipShape(RoundedRectangle(cornerRadius:22))
            Text(post.title).font(.system(size:24,weight:.bold));if post.sourceID != nil{Text("根据视频简介整理").font(.system(size:11)).foregroundStyle(Atelier.muted)};Text(post.text).font(.system(size:15)).lineSpacing(7).textSelection(.enabled)
            if let focus=post.learningFocus,let points=post.watchPoints{
                VStack(alignment:.leading,spacing:13){
                    HStack{Label("种草前，看看这几点",systemImage:"eye").font(.system(size:15,weight:.bold));Spacer();Text("看妆小贴士").font(.system(size:10)).foregroundStyle(Atelier.muted)}
                    Text(focus).font(.system(size:17,weight:.bold))
                    ForEach(Array(points.enumerated()),id:\.offset){index,point in HStack(alignment:.top,spacing:10){Text("0\(index+1)").font(.system(size:12,weight:.bold,design:.rounded)).foregroundStyle(Atelier.red);Text(point).font(.system(size:13)).lineSpacing(4)}}
                }.padding(18).frame(maxWidth:.infinity,alignment:.leading).background(Atelier.mint,in:RoundedRectangle(cornerRadius:22)).accessibilityIdentifier("教学观察题")
            }
            if let urlText=post.sourceURL,let url=URL(string:urlText){Link(destination:url){Label(post.sourceID != nil ? "看原视频 · "+(post.duration ?? ""):post.sourceTitle ?? "查看原帖",systemImage:"arrow.up.right.square").font(.system(size:12))};if let author=post.sourceAuthor{Text("原作者："+author).font(.system(size:11)).foregroundStyle(Atelier.muted)};if let date=post.importedAt{Text("读取于 "+date.formatted(date:.abbreviated,time:.shortened)).font(.system(size:10)).foregroundStyle(Atelier.muted)}}
            HStack{Button{store.updatePost(post.id){$0.liked.toggle()}}label:{Label(post.liked ? "已喜欢":"喜欢",systemImage:post.liked ? "heart.fill":"heart")};Spacer();Button{store.updatePost(post.id){$0.bookmarked.toggle()}}label:{Label(post.bookmarked ? "已收藏":"收藏",systemImage:post.bookmarked ? "bookmark.fill":"bookmark")};Spacer();if let url=post.sourceURL{ShareLink(item:url){Image(systemName:"square.and.arrow.up")}}}.font(.system(size:13)).padding(.vertical,6)
            RedButton(title:post.sourceID == nil ? "查查这篇内容":"这段话靠谱吗？",icon:"magnifyingglass"){store.checkPost(post)}.disabled(store.busy)
            Divider();Text("一起聊聊 · \(post.comments.count)").font(.system(size:17,weight:.bold))
            ForEach(post.comments){c in VStack(alignment:.leading,spacing:6){Text(c.author).font(.system(size:11,weight:.bold)).foregroundStyle(Atelier.red);Text(c.text).font(.system(size:14))}.frame(maxWidth:.infinity,alignment:.leading).padding(14).cuteCard()}
            HStack{TextField("分享你的看法",text:$comment).font(.system(size:14));Button("发送"){let value=comment.trimmingCharacters(in:.whitespacesAndNewlines);guard !value.isEmpty else{return};store.updatePost(post.id){$0.comments.append(SocialComment(text:String(value.prefix(500))))};comment=""}.disabled(comment.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)}.padding(15).cuteCard()
            if post.isMine{Button("删除这条动态",role:.destructive){store.social.posts.removeAll{$0.id==post.id};store.saveCommunity();dismiss()}.font(.system(size:12)).padding(.top,8)}
        }}
    }}
}

struct ComposeView:View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var title="";@State private var text="";@State private var category="美妆日常"
    @State private var source="";@State private var importedURL:String?;@State private var importedTitle:String?
    @State private var sourceAuthor:String?;@State private var readAt:Date?
    @State private var image:Data?;@State private var selected:PhotosPickerItem?
    @State private var loading=false;@State private var error:String?
    var body:some View{SheetShell(title:"分享一点美"){
        VStack(alignment:.leading,spacing:17){
            TextField("给这篇动态起个标题",text:$title).font(.system(size:22,weight:.bold)).padding(15).cuteCard().accessibilityIdentifier("动态标题")
            ZStack(alignment:.topLeading){if text.isEmpty{Text("今天的妆容、成分功课，或种草踩坑经历…").font(.system(size:14)).foregroundStyle(Atelier.muted).padding(15)};TextEditor(text:$text).frame(height:180).scrollContentBackground(.hidden).padding(8).accessibilityIdentifier("动态正文")}.cuteCard()
            PhotosPicker(selection:$selected,matching:.images){HStack{Image(systemName:"photo.badge.plus");Text(image == nil ? "加一张图片":"更换图片");Spacer();if let image,let ui=UIImage(data:image){Image(uiImage:ui).resizable().scaledToFit().frame(width:50,height:50)}}.font(.system(size:14)).padding(16).cuteCard()}
            Picker("分类",selection:$category){ForEach(["美妆日常","成分功课","鉴真心得"],id:\.self){Text($0)}}.pickerStyle(.segmented)
            DisclosureGroup("粘贴帖子链接"){
                VStack(alignment:.leading,spacing:12){TextField("https://…",text:$source).textInputAutocapitalization(.never).keyboardType(.URL).font(.system(size:13)).padding(13).cuteCard();Button(loading ? "正在读取…":"读取原文"){Task{await importLink()}}.disabled(loading || source.isEmpty);Text("原帖链接会一起保留。读不到时，可以自己写下帖子讲了什么。").font(.system(size:11)).foregroundStyle(Atelier.muted)}.padding(.top,10)
            }.font(.system(size:13))
            if let importedTitle{Label(importedTitle,systemImage:"link").font(.system(size:11)).foregroundStyle(Atelier.muted).lineLimit(2)}
            if let error{Text(error).font(.system(size:12)).foregroundStyle(Atelier.red)}
            RedButton(title:"发布动态",icon:"arrow.up"){publish()}.disabled(loading)
            Text("试用版动态只有你能看到，暂时不会发给其他人。").font(.system(size:11)).foregroundStyle(Atelier.muted)
        }
    }.onChange(of:selected){_,item in Task{if let d=try? await item?.loadTransferable(type:Data.self),let ui=UIImage(data:d){let scale=min(1,1400/max(ui.size.width,ui.size.height));let size=CGSize(width:ui.size.width*scale,height:ui.size.height*scale);image=UIGraphicsImageRenderer(size:size).image{_ in ui.draw(in:CGRect(origin:.zero,size:size))}.jpegData(compressionQuality:0.8)}}}}
    private func publish(){let t=title.trimmingCharacters(in:.whitespacesAndNewlines);let body=text.trimmingCharacters(in:.whitespacesAndNewlines);guard !t.isEmpty,!body.isEmpty else{error="写上标题和正文再发布吧。";return};guard t.count<=60,body.count<=5000 else{error="标题最多 60 字，正文最多 5000 字。";return};store.publish(title:t,text:body,category:category,image:image,sourceURL:importedURL ?? (URL(string:source)?.scheme=="https" ? source:nil),sourceTitle:importedTitle ?? (source.isEmpty ? nil:"用户附上的来源链接"),sourceAuthor:sourceAuthor,importedAt:readAt)}
    private func importLink() async{
        guard let url=URL(string:source),["http","https"].contains(url.scheme ?? "")else{error="请输入完整公开网址。";return};loading=true;defer{loading=false}
        do{let page=try await PublicPageReader.read(url.absoluteString);title=String(page.title.prefix(60));text=String(page.text.prefix(5000));importedURL=page.url;importedTitle=page.title;sourceAuthor=page.author;readAt=Date();error=nil}catch{self.error=error.localizedDescription}
    }
}
struct PublicPage:Decodable{let text:String;let title:String;let url:String;let author:String?}
enum PublicPageReader {
    static func read(_ address:String) async throws->PublicPage{
        let url=try ServiceEndpoint.url("page")
        var request=URLRequest(url:url);request.httpMethod="POST";request.timeoutInterval=30;request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.httpBody=try JSONSerialization.data(withJSONObject:["url":address]);let(data,response)=try await URLSession.shared.data(for:request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else{throw AuthenError.message("暂时读不到这篇帖子，可以粘贴原文，或写下你想分享的内容。")};return try JSONDecoder().decode(PublicPage.self,from:data)
    }
}
