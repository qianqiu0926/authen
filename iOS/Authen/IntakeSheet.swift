import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import CoreTransferable

struct PickedMovie:Transferable {
    let url:URL
    static var transferRepresentation:some TransferRepresentation {
        FileRepresentation(contentType:.movie) { movie in SentTransferredFile(movie.url) } importing:{ received in
            let url=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString+".mov")
            try FileManager.default.copyItem(at:received.file,to:url)
            return Self(url:url)
        }
    }
}

struct IntakeSheet:View {
    let kind:InputKind
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var text=""
    @State private var selected:[PhotosPickerItem]=[]
    @State private var movie:PhotosPickerItem?
    @State private var importing=false
    @State private var loading=false
    @State private var error:String?
    @State private var camera=false
    @State private var images:[Data]=[]
    @State private var mediaURL:URL?
    @FocusState private var focus:Bool
    var body:some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:18){
                    HStack(spacing:15){CuteIcon(name:kind.cuteAsset,size:64);VStack(alignment:.leading,spacing:6){Text(kind.entryTitle).font(.system(size:25,weight:.bold));Text(helper).font(.system(size:12)).foregroundStyle(Atelier.muted)}}
                    ZStack(alignment:.topLeading){
                        if text.isEmpty{Text(placeholder).foregroundStyle(Atelier.muted).padding(14).allowsHitTesting(false)}
                        TextEditor(text:$text).frame(height:kind == .text || kind == .comments ? 190:110).scrollContentBackground(.hidden).padding(8).focused($focus).accessibilityIdentifier("素材输入框")
                    }.background(Atelier.white,in:RoundedRectangle(cornerRadius:18)).overlay(RoundedRectangle(cornerRadius:18).stroke(Atelier.line))
                    if kind != .link {
                        if kind == .video {
                            PhotosPicker(selection:$movie,matching:.videos){pickLabel("选一段视频",icon:"play.rectangle")}
                        } else if kind != .audio {
                            PhotosPicker(selection:$selected,maxSelectionCount:5,matching:.images){pickLabel(images.isEmpty ? "添加图片或截图":"重新选择图片",icon:"photo.on.rectangle.angled")}
                        }
                        HStack{
                            Button{importing=true}label:{pickLabel("从文件选",icon:"folder")}
                            if kind == .image {Button{if UIImagePickerController.isSourceTypeAvailable(.camera){camera=true}else{error="模拟器不能拍照，请选图片。"}}label:{pickLabel("拍一张",icon:"camera")}}
                        }
                    }
                    if !images.isEmpty {
                        ScrollView(.horizontal){HStack{ForEach(Array(images.enumerated()),id:\.offset){i,data in if let ui=UIImage(data:data){Image(uiImage:ui).resizable().scaledToFill().frame(width:78,height:90).clipped().clipShape(RoundedRectangle(cornerRadius:12)).overlay(alignment:.topTrailing){Button{images.remove(at:i)}label:{Image(systemName:"xmark.circle.fill").foregroundStyle(.white,Atelier.red)}.padding(4)}}}}}
                    }
                    if let url=mediaURL{Label(url.lastPathComponent,systemImage:kind == .audio ? "waveform":"film").font(.system(size:12)).lineLimit(1).padding(14).cuteCard()}
                    if loading{ProgressView("正在读取文件")}
                    if let error{Text(error).font(.system(size:13)).foregroundStyle(Atelier.red).accessibilityIdentifier("输入错误")}
                    RedButton(title:"帮我查查",icon:"sparkle.magnifyingglass"){submit()}.disabled(loading || store.busy)
                    Text(kind == .audio ? "声音会先转成文字，再交给 DeepSeek 看看说了什么。暂时不能判断是不是 AI 配音。":"开启 AI 时，提交的文字和图片会发送给 DeepSeek。资料卡仅保存在本机。")
                        .font(.system(size:11)).foregroundStyle(Atelier.muted).lineSpacing(3)
                }.padding(22)
            }.background(Atelier.paper).scrollDismissesKeyboard(.interactively)
            .navigationTitle("查一查").navigationBarTitleDisplayMode(.inline)
            .toolbar{ToolbarItem(placement:.topBarTrailing){Button("取消"){dismiss()}}}
        }
        .fileImporter(isPresented:$importing,allowedContentTypes:kind == .audio ? [.audio]:kind == .video ? [.movie]:[.image],allowsMultipleSelection:kind != .audio && kind != .video){result in Task{await handleFiles(result)}}
        .fullScreenCover(isPresented:$camera){CameraPicker{image in camera=false;if let data=image?.jpegData(compressionQuality:0.85){images=Array((images+[data]).prefix(5))}}.ignoresSafeArea()}
        .onChange(of:selected){_,items in Task{await readPhotos(items)}}
        .onChange(of:movie){_,item in Task{guard let item else{return};loading=true;defer{loading=false};do{guard let picked=try await item.loadTransferable(type:PickedMovie.self)else{throw AuthenError.message("视频没能打开。")};try acceptMedia(picked.url)}catch{self.error=error.localizedDescription}}}
    }
    private var helper:String{switch kind{case .image:"截图、长图、商品图 · 最多 5 张";case .text:"种草文章、商品说法，都可以";case .comments:"一条评论一行，前后几句也一起贴上";case .link:"贴上链接，或直接粘贴分享时的整段文字";case .video:"60 秒以内 · 最多 50 MB";case .audio:"导入口播或录音 · 60 秒以内"}}
    private var placeholder:String{kind == .link ? "把分享链接粘贴在这里…":kind == .text || kind == .comments ? "粘贴内容，或写下你的疑问…":"补充你想查的说法（选填）…"}
    private func pickLabel(_ title:String,icon:String)->some View{HStack(spacing:10){Image(systemName:icon);Text(title);Spacer(minLength:0)}.font(.system(size:14,weight:.medium)).padding(17).background(Atelier.white,in:RoundedRectangle(cornerRadius:16))}
    private func submit(){
        let content=text.trimmingCharacters(in:.whitespacesAndNewlines)
        guard content.count<=10000 else{error="内容太长，先选出你关心的部分。";return}
        if kind == .link {
            let detector=try? NSDataDetector(types:NSTextCheckingResult.CheckingType.link.rawValue)
            guard let url=detector?.firstMatch(in:content,range:NSRange(content.startIndex...,in:content))?.url,["http","https"].contains(url.scheme ?? "") else{error="没找到完整链接，重新粘贴一下。";return}
            store.accept(Material(kind:.link,link:url.absoluteString))
        } else {
            guard !content.isEmpty || !images.isEmpty || mediaURL != nil else{error="先放入一份内容吧。";return}
            if kind == .audio || kind == .video {guard mediaURL != nil else{error="先选一个文件吧。";return}}
            store.accept(Material(kind:kind,text:content,images:images,videoURL:mediaURL))
        }
    }
    private func normalize(_ data:Data)throws->Data{
        guard data.count<=10_000_000,let image=UIImage(data:data)else{throw AuthenError.message("请选择 10 MB 以内的图片。")}
        let scale=min(1,1800/max(image.size.width,image.size.height));let size=CGSize(width:image.size.width*scale,height:image.size.height*scale)
        return UIGraphicsImageRenderer(size:size).image{_ in image.draw(in:CGRect(origin:.zero,size:size))}.jpegData(compressionQuality:0.85) ?? data
    }
    private func readPhotos(_ items:[PhotosPickerItem]) async{
        guard !items.isEmpty else{return};loading=true;defer{loading=false}
        do{var data:[Data]=[];for item in items{guard let d=try await item.loadTransferable(type:Data.self)else{throw AuthenError.message("图片没能打开。")};data.append(try normalize(d))};images=data}catch{self.error=error.localizedDescription}
    }
    private func acceptMedia(_ url:URL)throws{guard (try url.resourceValues(forKeys:[.fileSizeKey])).fileSize ?? 0 <= 50_000_000 else{throw AuthenError.message("文件需要小于 50 MB。")};mediaURL=url}
    private func handleFiles(_ result:Result<[URL],Error>) async{
        loading=true;defer{loading=false}
        do{let urls=try result.get();guard urls.count<=5 else{throw AuthenError.message("最多选择 5 张图片。")};var picked:[Data]=[]
            for url in urls{let access=url.startAccessingSecurityScopedResource();defer{if access{url.stopAccessingSecurityScopedResource()}}
                if kind == .audio || kind == .video{let dest=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString+"."+url.pathExtension);try FileManager.default.copyItem(at:url,to:dest);try acceptMedia(dest);return}
                else{picked.append(try normalize(Data(contentsOf:url)))}}
            images=picked
        }catch{self.error=error.localizedDescription}
    }
}

struct CameraPicker:UIViewControllerRepresentable {
    var completion:(UIImage?)->Void
    func makeCoordinator()->Coordinator{Coordinator(completion)}
    func makeUIViewController(context:Context)->UIImagePickerController {let p=UIImagePickerController();p.sourceType = .camera;p.delegate=context.coordinator;return p}
    func updateUIViewController(_ uiViewController:UIImagePickerController,context:Context){}
    final class Coordinator:NSObject,UIImagePickerControllerDelegate,UINavigationControllerDelegate {
        let completion:(UIImage?)->Void
        init(_ completion:@escaping(UIImage?)->Void){self.completion=completion}
        func imagePickerController(_ picker:UIImagePickerController,didFinishPickingMediaWithInfo info:[UIImagePickerController.InfoKey:Any]){completion(info[.originalImage] as? UIImage)}
        func imagePickerControllerDidCancel(_ picker:UIImagePickerController){completion(nil)}
    }
}
