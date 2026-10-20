import SwiftUI

struct BeautySource:Decodable {
    let id:String;let title:String;let summary:String;let category:String;let asset:String
    let sourceURL:String;let sourceTitle:String;let author:String;let publishedAt:String;let duration:String;let retrievedAt:String
    let learningFocus:String?;let watchPoints:[String]?
    static var all:[BeautySource]{
        guard let url=Bundle.main.url(forResource:"BeautySources",withExtension:"json"),let data=try? Data(contentsOf:url)else{return []}
        return (try? JSONDecoder().decode([BeautySource].self,from:data)) ?? []
    }
    var post:BeautyPost{
        let date=ISO8601DateFormatter().date(from:publishedAt+"T00:00:00Z") ?? .distantPast
        let parser=ISO8601DateFormatter();parser.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        return BeautyPost(author:author,title:title,text:summary,category:category,asset:asset,createdAt:date,sourceURL:sourceURL,sourceTitle:sourceTitle,importedAt:parser.date(from:retrievedAt),sourceAuthor:author,platform:"YouTube",sourceID:id,publishedAt:publishedAt,duration:duration,learningFocus:learningFocus,watchPoints:watchPoints)
    }
}

struct DiscoverySection:View {
    @Environment(AppStore.self) private var store
    private var posts:[BeautyPost]{store.social.posts.filter{$0.sourceID != nil}}
    var body:some View{
        VStack(alignment:.leading,spacing:13){
            HStack{Text("我的发现").font(.system(size:21,weight:.bold));Spacer();Button("更多灵感 ›"){store.tab = .feed}.font(.system(size:12))}
            if let first=posts.first(where:{$0.sourceID=="zg5xAafJ080"}){
                Button{store.openPost(first)}label:{VStack(alignment:.leading,spacing:0){
                    PostArt(post:first).frame(height:184).clipped().overlay(alignment:.bottomTrailing){Label(first.duration ?? "视频",systemImage:"play.fill").font(.system(size:11,weight:.semibold)).padding(8).background(.black.opacity(0.65),in:Capsule()).foregroundStyle(.white).padding(11)}
                    VStack(alignment:.leading,spacing:10){
                        HStack{TagPill(text:"唇妆小课堂");Text(first.sourceAuthor ?? first.author).font(.system(size:10)).foregroundStyle(Atelier.muted);Spacer()}
                        Text("3CE 口红，怎么涂更好看？").font(.system(size:19,weight:.bold))
                        Text("内侧上色 → 轻抿 → 向外晕开").font(.system(size:13)).foregroundStyle(Atelier.muted)
                        HStack{Text("看三步渐变唇教程");Spacer();Image(systemName:"arrow.up.right")}.font(.system(size:12,weight:.semibold)).foregroundStyle(Atelier.red)
                    }.padding(17)
                }.background(Atelier.white).clipShape(RoundedRectangle(cornerRadius:23)).overlay(RoundedRectangle(cornerRadius:23).stroke(Atelier.line,lineWidth:1))}.buttonStyle(.plain).accessibilityIdentifier("发现-3CE教程")
            }
            ForEach(Array(posts.filter{$0.sourceID != "zg5xAafJ080"}.prefix(2))){post in
                Button{store.openPost(post)}label:{HStack(spacing:13){PostArt(post:post).frame(width:108,height:88).clipped().clipShape(RoundedRectangle(cornerRadius:14));VStack(alignment:.leading,spacing:7){Text(post.title).font(.system(size:14,weight:.semibold)).lineLimit(2);Text((post.platform ?? "")+" · "+post.author).font(.system(size:10)).foregroundStyle(Atelier.muted).lineLimit(1)};Spacer(minLength:0)}.padding(12).cuteCard()}.buttonStyle(.plain)
            }
        }
    }
}
