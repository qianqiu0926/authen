import Foundation

enum RemoteReview {
    private struct InputLine:Encodable {
        let text:String
        let box:[Double]?
        let imageIndex:Int?
        let seconds:Double?
    }
    private struct Payload:Encodable {
        let kind:String
        let text:String
        let scope:String
        let lines:[InputLine]
        let images:[String]
    }
    private struct Finding:Decodable {
        let text:String
        let finding:String
        let why:String
        let source:String
        let excerpt:String
        let box:[Double]?
        let imageIndex:Int?
        let seconds:Double?
    }
    private struct Response:Decodable {
        let verdict:Verdict
        let summary:String
        let next:String
        let scope:String
        let analysisLabel:String
        let evidence:[Finding]
        let references:[CardReference]?
        let numbers:[CardNumber]?
        let answerKind:String?
        let tips:[String]?
    }
    private struct Failure:Decodable {let error:String}

    static func review(_ material:Material,read:ReadMaterial,session:URLSession = .shared) async throws -> AnalysisReport {
        let endpoint=try ServiceEndpoint.url("review")
        let payload=Payload(kind:material.kind.rawValue,text:read.text,scope:read.scope,
            lines:read.lines.prefix(300).map{InputLine(text:$0.text,box:$0.box,imageIndex:$0.imageIndex,seconds:$0.seconds)},
            images:read.images.prefix(8).map{"data:image/jpeg;base64,"+$0.base64EncodedString()})
        var request=URLRequest(url:endpoint);request.httpMethod="POST";request.timeoutInterval=100
        request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        request.httpBody=try JSONEncoder().encode(payload)
        let data:Data,response:URLResponse
        do{(data,response)=try await session.data(for:request)}
        catch{try Task.checkCancellation();throw AuthenError.message("AI 暂时没连上，稍后再试试。")}
        try Task.checkCancellation()
        guard let http=response as? HTTPURLResponse,(200..<300).contains(http.statusCode) else {
            let message=(try? JSONDecoder().decode(Failure.self,from:data).error) ?? "AI分析暂不可用。"
            throw AuthenError.message(message)
        }
        guard let result=try? JSONDecoder().decode(Response.self,from:data) ,!result.summary.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else {
            throw AuthenError.message("AI返回内容不完整，请稍后重试。")
        }
        return AnalysisReport(kind:material.kind,title:material.title,verdict:result.verdict,summary:result.summary,
            originalText:read.text,evidence:result.evidence.map{Evidence(quote:$0.text,finding:$0.finding,explanation:$0.why,sourceTitle:$0.source,sourceExcerpt:$0.excerpt,box:$0.box,seconds:$0.seconds,imageIndex:$0.imageIndex)},
            nextStep:result.next,scope:result.scope,isSample:false,preview:read.preview,
            sourceLink:material.link.isEmpty ? nil:material.link,coveredFrames:read.frameTimes,images:read.images,analysisLabel:result.analysisLabel,references:result.references,answerKind:result.answerKind,tips:result.tips,numbers:result.numbers)
    }
}
