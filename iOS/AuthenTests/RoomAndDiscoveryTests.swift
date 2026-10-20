import XCTest
import UIKit
@testable import AUTHEN

final class RoomAndDiscoveryTests:XCTestCase {
    func testFurnitureStaysInsideFloorAfterRotation(){
        let p=RoomLayout.bounded(RoomPiece(id:"vanity",kind:"vanity",x:20,z:-20,angle:450))
        XCTAssertEqual(p.angle,90);XCTAssertLessThanOrEqual(p.x,2.71);XCTAssertGreaterThanOrEqual(p.z,-1.46)
    }
    @MainActor func testMoveRotateUndoAndRoundTrip() throws {
        let editor=RoomEditor();editor.load(.initial);editor.choose("stool")
        editor.update{$0.x+=0.2};editor.update{$0.angle+=45}
        XCTAssertEqual(editor.piece?.angle,45);XCTAssertEqual(try XCTUnwrap(editor.piece?.x),-0.5,accuracy:0.001);XCTAssertTrue(editor.dirty)
        let saved=try JSONDecoder().decode(RoomLayout.self,from:JSONEncoder().encode(editor.layout));XCTAssertEqual(saved,editor.layout)
        editor.undo();XCTAssertEqual(editor.piece?.angle,0);editor.undo();XCTAssertEqual(editor.layout,RoomLayout.initial);XCTAssertFalse(editor.dirty)
    }
    @MainActor func testDraggingRespectsFurnitureAndUndo(){
        let editor=RoomEditor();editor.load(.initial);editor.choose("stool");let before=editor.layout
        editor.startDrag();editor.drag(x:-0.7,z:-2.08);editor.endDrag();XCTAssertEqual(before,editor.layout)
        editor.startDrag();editor.drag(x:1.0,z:-0.4);editor.endDrag();XCTAssertNotEqual(before,editor.layout)
        editor.undo();XCTAssertEqual(editor.layout,before)
    }
    func testLegacyCommunityCanLoadWithoutLayoutOrSourceFields() throws {
        let data=Data(#"{"posts":[],"leaves":14,"ledger":[],"rewards":[],"roomItems":[],"style":"樱桃红","profileConsent":false}"#.utf8)
        let state=try JSONDecoder().decode(CommunityState.self,from:data);XCTAssertEqual(state.leaves,14);XCTAssertNil(state.roomLayout)
    }
    func testImportedVideosHaveOriginalAssetsAndSources() throws {
        XCTAssertEqual(BeautySource.all.count,8)
        for item in BeautySource.all{
            XCTAssertTrue(item.sourceURL.hasPrefix("https://www.youtube.com/watch?v="));XCTAssertNotNil(UIImage(named:item.asset));XCTAssertFalse(item.post.isExample);XCTAssertEqual(item.post.author,item.author);XCTAssertNotNil(item.post.importedAt)
        }
        XCTAssertTrue(BeautySource.all.first{$0.id=="zg5xAafJ080"}?.summary.contains("棉签") == true)
    }
}
