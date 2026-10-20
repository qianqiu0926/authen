import Foundation
import UIKit
import Vision
import AVFoundation
@preconcurrency import Speech

struct ReadMaterial {
    var text: String
    var lines: [RecognizedLine]
    var preview: Data?
    var frameTimes: [Double]
    var scope: String
    var images: [Data]
}

enum MediaReader {
    static func imageLines(_ data:Data,index:Int=0,seconds:Double?=nil) async throws -> [RecognizedLine] {
        try await Task.detached(priority:.userInitiated) {
            let request=VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages=["zh-Hans","en-US"]
            request.usesLanguageCorrection=true
            try VNImageRequestHandler(data:data).perform([request])
            return (request.results ?? []).compactMap { o in
                guard let t=o.topCandidates(1).first?.string else {return nil}
                let b=o.boundingBox
                return RecognizedLine(text:t,box:[b.minX,1-b.maxY,b.width,b.height],imageIndex:index,seconds:seconds)
            }
        }.value
    }

    static func read(_ material:Material) async throws -> ReadMaterial {
        var text=material.text
        var lines:[RecognizedLine]=[]
        var preview=material.images.first
        var times:[Double]=[]
        var allImages=material.images
        var scope="这次看的是你发来的文字，具体功效还要看看商品说明。"
        if material.kind == .link {
            guard let url=URL(string:material.link),["https","http"].contains(url.scheme?.lowercased() ?? ""),url.host != nil else {throw AuthenError.message("链接不完整，再检查一下。")}
            let page=try await PublicPageReader.read(url.absoluteString)
            text=String(page.text.prefix(10000))
            scope="这次看了链接里的文字，还没看全里面的图片和评论。"
        }
        for (index,data) in material.images.enumerated() {
            try Task.checkCancellation()
            lines += try await imageLines(data,index:index)
        }
        if !material.images.isEmpty {scope="这次看了图片里的文字。图片修没修、是不是 AI 画的，还不能确定。"}
        if let url=material.videoURL {
            let asset=AVURLAsset(url:url)
            let duration=try await asset.load(.duration).seconds
            guard duration.isFinite,duration>0,duration<=61 else {throw AuthenError.message("先截取60秒以内的片段。")}
            if material.kind != .audio {
            let generator=AVAssetImageGenerator(asset:asset)
            generator.appliesPreferredTrackTransform=true
            generator.maximumSize=CGSize(width:1200,height:1200)
            let count=min(8,max(2,Int(duration/5)+1))
            for i in 0..<count {
                try Task.checkCancellation()
                let time=min(max(0,duration-0.1),Double(i)*duration/Double(count))
                let image=try await generator.image(at:CMTime(seconds:time,preferredTimescale:600)).image
                guard let data=UIImage(cgImage:image).jpegData(compressionQuality:0.8) else {continue}
                if preview == nil {preview=data}
                allImages.append(data)
                lines += try await imageLines(data,index:allImages.count-1,seconds:time)
                times.append(time)
            }
            scope="这次看了视频中的 \(times.count) 张画面和能读清的字幕，没有看完整段视频。"
            }
            if material.kind == .audio || UserDefaults.standard.object(forKey:"videoSpeech") as? Bool != false {
                do {
                    let speech=try await transcribeVideo(asset)
                    lines += speech.segments.map{RecognizedLine(text:$0.text,box:nil,imageIndex:nil,seconds:$0.start)}
                    if material.kind == .audio{scope="这次把声音转成了文字，可能有听错的地方，尤其是数字，可以回听一下。"}else{scope += "也把口播转成了文字，可能有听错的地方。"}
                } catch {if material.kind == .audio {throw error};scope += "这次没听清声音。"}
            } else {scope += "这次没有看声音里的内容。"}
        }
        let recognized=lines.map{line in (line.imageIndex == nil ? "【口播】":"【图片或字幕】")+line.text}.joined(separator:"\n")
        if !recognized.isEmpty {text += "\n"+recognized}
        text=text.trimmingCharacters(in:.whitespacesAndNewlines)
        return ReadMaterial(text:text,lines:lines,preview:preview,frameTimes:times,scope:scope,images:allImages)
    }

    private static func transcribeVideo(_ asset:AVAsset) async throws -> AudioTranscript {
        guard let export=AVAssetExportSession(asset:asset,presetName:AVAssetExportPresetAppleM4A) else {throw AuthenError.message("未找到声音。")}
        let output=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString+".m4a")
        defer {try? FileManager.default.removeItem(at:output)}
        try await export.export(to:output,as:.m4a)
        #if targetEnvironment(simulator)
        return try await LocalTranscriber.read(output)
        #else
        let status=await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning:$0) }
        }
        guard status == .authorized else {throw AuthenError.message("未开启声音识别。")}
        guard let recognizer=SFSpeechRecognizer(locale:Locale(identifier:"zh_CN")),recognizer.isAvailable else {throw AuthenError.message("声音识别暂不可用。")}
        let request=SFSpeechURLRecognitionRequest(url:output)
        request.shouldReportPartialResults=false
        return try await withCheckedThrowingContinuation { continuation in
            let completion=SpeechCompletion(continuation)
            let task=recognizer.recognitionTask(with:request) { result,error in
                if let error {completion.finish(.failure(error));return}
                if let result,result.isFinal {completion.finish(.success(AudioTranscript(text:result.bestTranscription.formattedString,segments:result.bestTranscription.segments.map{AudioSegment(text:$0.substring,start:$0.timestamp,end:$0.timestamp+$0.duration)})))}
            }
            completion.attach(task)
            DispatchQueue.main.asyncAfter(deadline:.now()+25) {
                completion.finish(.failure(AuthenError.message("声音识别超时。")))
            }
        }
        #endif
    }
}

struct AudioSegment:Codable {let text:String;let start:Double;let end:Double}
struct AudioTranscript:Codable {let text:String;let segments:[AudioSegment]}
enum LocalTranscriber {
    static func read(_ url:URL) async throws->AudioTranscript{
        var request=URLRequest(url:try ServiceEndpoint.url("transcribe"));request.httpMethod="POST";request.timeoutInterval=240;request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        request.httpBody=try JSONSerialization.data(withJSONObject:["audioBase64":try Data(contentsOf:url).base64EncodedString()])
        let(data,response)=try await URLSession.shared.data(for:request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else{throw AuthenError.message("没能听清这段声音，稍后再试，或换一段清晰录音。")}
        return try JSONDecoder().decode(AudioTranscript.self,from:data)
    }
}

private final class SpeechCompletion:@unchecked Sendable {
    private let lock=NSLock()
    private var finished=false
    private var task:SFSpeechRecognitionTask?
    private let continuation:CheckedContinuation<AudioTranscript,Error>
    init(_ continuation:CheckedContinuation<AudioTranscript,Error>){self.continuation=continuation}
    func attach(_ task:SFSpeechRecognitionTask){lock.lock();let done=finished;self.task=task;lock.unlock();if done{task.cancel()}}
    func finish(_ result:Result<AudioTranscript,Error>){
        lock.lock();guard !finished else{lock.unlock();return};finished=true;let task=task;lock.unlock()
        task?.cancel();continuation.resume(with:result)
    }
}

enum ContentReview {
    static func review(_ material:Material,read:ReadMaterial)->AnalysisReport {
        if let sample=material.sample {return sampleReport(sample,material:material,read:read)}
        var evidence:[Evidence]=[]
        let rules:[(String,String,String)]=[
            ("([0-9一二三四五六七八九十两]+\\s*[天日周].{0,8}(美白|变白|祛斑|去皱|祛痘))","真能这么快见效？","每个人见效快慢不一样，光凭这几句话还不能确定。可以看看品牌有没有写测试了多久、哪些人用过。"),
            ("(百分之百|100%|绝对|永久|零刺激|无副作用|包治|根治|最有效)","效果说得太满了","每个人的皮肤反应不一样，不能保证人人都适合。可以问问品牌，这个说法是怎么测出来的。"),
            ("(代替医美|替代医美|治疗皮炎|治疗湿疹|修复DNA)","护肤品真能做到吗？","这已经不只是日常护肤的说法。先看看包装写了什么用途，皮肤不舒服时也可以问医生。")
        ]
        for (pattern,title,explanation) in rules {
            guard let regex=try? NSRegularExpression(pattern:pattern,options:.caseInsensitive) else {continue}
            let ns=read.text as NSString
            for match in regex.matches(in:read.text,range:NSRange(location:0,length:ns.length)).prefix(3) {
                let quote=ns.substring(with:match.range)
                if evidence.contains(where:{$0.quote==quote}) {continue}
                let line=read.lines.first{$0.text.contains(quote)}
                evidence.append(Evidence(quote:quote,finding:title,explanation:explanation,sourceTitle:"你发来的内容",sourceURL:material.link.isEmpty ? nil:material.link,sourceExcerpt:"你发来的内容里还没有相关商品说明。",box:line?.box,seconds:line?.seconds,imageIndex:line?.imageIndex))
            }
        }
        let hasPromises = !evidence.isEmpty
        let comments=read.text.components(separatedBy:.newlines).map{$0.trimmingCharacters(in:.whitespacesAndNewlines)}.filter{$0.count>=8}
        let groups=Dictionary(grouping:comments,by:{$0})
        if (material.kind == .text || material.kind == .comments), let repeated=groups.filter({$0.value.count>=3}).sorted(by:{$0.value.count>$1.value.count}).first {
            evidence.append(Evidence(quote:repeated.key,finding:"这句话重复出现\(repeated.value.count)次",explanation:"你发来的评论里，有几条写得一模一样，可能是复制的。但光看这点，还不能说是水军。",sourceTitle:"本次提交的\(comments.count)段文字",sourceExcerpt:"评论重复不等于刷好评。"))
        }
        if evidence.isEmpty {
            evidence=[Evidence(quote:read.text.isEmpty ? "图片／视频里的内容" : String(read.text.prefix(60)),finding:read.text.isEmpty ? "这张图没看清":"还不能确定说得对不对",explanation:read.text.isEmpty ? "图里的字没读清。补张清晰图，或写下你想查的那句话。":"暂时没找到常见的夸大说法，但还不能保证内容都对。发来商品说明或原帖，可以继续看。",sourceTitle:"本次材料",sourceExcerpt:read.scope)]
        }
        let flagged=evidence.contains{$0.finding != "还不能确定说得对不对" && $0.finding != "这张图没看清"}
        return AnalysisReport(kind:material.kind,title:material.title,verdict:flagged ? .flagged:.unclear,summary:flagged ? (hasPromises ? "这几句话说得有点满，先别急着下单。":"你发来的评论有重复，但还不能说是刷好评。") : "光看这些，还不能确定说得对不对。",originalText:read.text,evidence:evidence,nextStep:flagged ? (hasPromises ? "发来包装上的功效说明，或问问品牌这句话是怎么得出的。":"可以回到原帖，看看这些评论前后还聊了什么。") : "补上商品名和清晰包装图，再帮你看看。",scope:read.scope+"这次只在手机里找了常见夸大说法，没有查询外部资料。",isSample:false,preview:read.preview,sourceLink:material.link.isEmpty ? nil:material.link,coveredFrames:read.frameTimes,images:allImagesForReport(read))
    }

    private static func allImagesForReport(_ read:ReadMaterial)->[Data] {read.images}

    private static func sampleReport(_ sample:String,material:Material,read:ReadMaterial)->AnalysisReport {
        let status:Verdict=sample=="supported" ? .supported:sample=="unclear" ? .unclear:.flagged
        let evidence:[Evidence]
        if status == .supported {
            evidence=[Evidence(quote:"含甘油，帮助保湿",finding:"保湿这点，说明里有写",explanation:"示例成分表里有甘油，用途也写了保湿，和这条笔记说的一样。",sourceTitle:"示例商品资料 · AUTHEN演示库",sourceExcerpt:"演示保湿乳｜成分：水、甘油等。用途：保湿。本条资料由团队为演示编写，不对应在售商品。")]
        } else if status == .flagged {
            evidence=[Evidence(quote:"7天变白",finding:"只写了保湿，没写能变白",explanation:"示例商品说明只写了保湿，没说能在7天内变白。",sourceTitle:"示例商品资料 · AUTHEN演示库",sourceExcerpt:"演示保湿乳｜用途：保湿。没有提供7天变白的试验说明。",box:[0.08,0.19,0.75,0.10],imageIndex:0),Evidence(quote:"100%无刺激",finding:"敏感肌也不能保证零刺激",explanation:"每个人的皮肤反应不一样，这份内容没说“100%”是怎么测出来的。",sourceTitle:"示例笔记原文",sourceExcerpt:"这是团队编写的夸大话术演示样本。",box:[0.08,0.30,0.72,0.09],imageIndex:0)]
        } else {
            evidence=[Evidence(quote:"这个真的好用吗？",finding:"还没认出是哪款商品",explanation:"名称和包装信息不完整，补一张清楚的图就能继续。",sourceTitle:"示例图片",sourceExcerpt:"这是一个图片太糊、暂时看不清的示例。")]
        }
        return AnalysisReport(kind:.image,title:"美妆笔记 · 示例",verdict:status,summary:status == .supported ? "保湿这点，和示例商品说明对得上。":status == .flagged ? "只写了保湿，没说7天能变白；“100%无刺激”也没讲怎么测的。":"包装没看清，还不知道是哪一款。",originalText:material.text,evidence:evidence,nextStep:status == .supported ? "说明写了保湿，实际用着怎么样，还要看你的肤质。":"发张清晰包装图，看看上面怎么写。",scope:"这份笔记和商品说明都是团队编写的示例，不对应真实品牌或在售商品。",isSample:true,preview:read.preview,images:read.images)
    }
}
