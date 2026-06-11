import Foundation
import Capacitor
import RoomPlan
import ARKit
import UIKit
import CoreImage

@available(iOS 16.0, *)
@objc(RoomPlanPlugin)
public class RoomPlanPlugin: CAPPlugin, RoomCaptureSessionDelegate {
    
    private var captureSession: RoomCaptureSession?
    private var captureView: RoomCaptureView?
    private var savedCall: CAPPluginCall?
    private var arSession: ARSession? {
        return captureView?.captureSession.arSession
    }
    
    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.0, *) {
            let available = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
            call.resolve(["available": available])
        } else {
            call.resolve(["available": false])
        }
    }

    /// Capture a JPEG snapshot of the current ARKit frame during an active RoomPlan session.
    /// Returns base64 image + the device's position in the room coordinate system, so the
    /// app can link the photo to a building element (gevel, dak, vloer, etc.).
    @objc func capturePhoto(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("capturePhoto requires iOS 16.0 or later")
            return
        }
        guard let session = self.arSession, let frame = session.currentFrame else {
            call.reject("No active scan session")
            return
        }

        let bouwdeel = call.getString("bouwdeel") ?? ""
        let pixelBuffer = frame.capturedImage

        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let context = CIContext()
        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
            call.reject("Failed to render frame")
            return
        }
        let uiImage = UIImage(cgImage: cgImage, scale: 1.0, orientation: .right)
        guard let jpegData = uiImage.jpegData(compressionQuality: 0.7) else {
            call.reject("Failed to encode JPEG")
            return
        }

        // Device translation = current camera position in the ARKit world
        let transform = frame.camera.transform
        let position: [String: Float] = [
            "x": transform.columns.3.x,
            "y": transform.columns.3.y,
            "z": transform.columns.3.z,
        ]

        call.resolve([
            "base64": jpegData.base64EncodedString(),
            "mimeType": "image/jpeg",
            "bouwdeel": bouwdeel,
            "position": position,
        ])
    }
    
    @objc func startScan(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("RoomPlan requires iOS 16.0 or later")
            return
        }
        
        self.savedCall = call
        
        DispatchQueue.main.async {
            let sessionConfig = RoomCaptureSession.Configuration()
            
            self.captureView = RoomCaptureView(frame: UIScreen.main.bounds)
            self.captureView?.captureSession.delegate = self
            // captureView?.delegate intentionally not set — we only use the session delegate
            
            if let viewController = self.bridge?.viewController {
                self.captureView?.captureSession.run(configuration: sessionConfig)
                viewController.view.addSubview(self.captureView!)
            } else {
                call.reject("Unable to present RoomPlan scanner")
            }
        }
    }
    
    // MARK: - RoomCaptureSessionDelegate
    
    public func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        if let error = error {
            savedCall?.reject("Scan failed: \(error.localizedDescription)")
            cleanup()
            return
        }
        
        Task {
            do {
                let roomBuilder = RoomBuilder(options: [.beautifyObjects])
                let room = try await roomBuilder.capturedRoom(from: data)

                // Calculate total area
                var totalArea: Float = 0
                for floor in room.floors {
                    totalArea += floor.dimensions.x * floor.dimensions.z
                }

                // Build structured room data
                var scannedRooms: [[String: Any]] = []

                if #available(iOS 17.0, *) {
                    // iOS 17+ has individual room sections
                    for (index, section) in room.sections.enumerated() {
                        var roomDict: [String: Any] = [
                            "id": "lidar-room-\(index)",
                            "name": self.labelForSection(section, index: index),
                            "type": self.typeForSection(section),
                            "floor": section.story ?? 0,
                            "length": String(format: "%.2f", section.center.x > 0 ? abs(section.boundingBox.max.x - section.boundingBox.min.x) : 0),
                            "width": String(format: "%.2f", abs(section.boundingBox.max.z - section.boundingBox.min.z)),
                            "height": String(format: "%.2f", abs(section.boundingBox.max.y - section.boundingBox.min.y)),
                        ]

                        // Collect windows and doors for this section
                        var windows: [[String: Any]] = []
                        for (wIdx, window) in room.windows.enumerated() {
                            if self.isInBounds(window.center, bounds: section.boundingBox) {
                                windows.append([
                                    "id": "lidar-w-\(index)-\(wIdx)",
                                    "type": "raam",
                                    "width": String(format: "%.0f", window.dimensions.x * 100),
                                    "height": String(format: "%.0f", window.dimensions.y * 100),
                                ])
                            }
                        }
                        for (dIdx, door) in room.doors.enumerated() {
                            if self.isInBounds(door.center, bounds: section.boundingBox) {
                                windows.append([
                                    "id": "lidar-d-\(index)-\(dIdx)",
                                    "type": "deur",
                                    "width": String(format: "%.0f", door.dimensions.x * 100),
                                    "height": String(format: "%.0f", door.dimensions.y * 100),
                                ])
                            }
                        }
                        roomDict["windows"] = windows
                        scannedRooms.append(roomDict)
                    }
                } else {
                    // iOS 16: single room, use overall dimensions
                    var singleRoom: [String: Any] = [
                        "id": "lidar-room-0",
                        "name": "Gescande ruimte",
                        "type": "woonkamer",
                        "floor": 0,
                        "length": String(format: "%.2f", room.floors.first?.dimensions.x ?? 0),
                        "width": String(format: "%.2f", room.floors.first?.dimensions.z ?? 0),
                        "height": String(format: "%.2f", room.walls.first?.dimensions.y ?? 2.6),
                    ]

                    var windows: [[String: Any]] = []
                    for (wIdx, window) in room.windows.enumerated() {
                        windows.append([
                            "id": "lidar-w-0-\(wIdx)",
                            "type": "raam",
                            "width": String(format: "%.0f", window.dimensions.x * 100),
                            "height": String(format: "%.0f", window.dimensions.y * 100),
                        ])
                    }
                    for (dIdx, door) in room.doors.enumerated() {
                        windows.append([
                            "id": "lidar-d-0-\(dIdx)",
                            "type": "deur",
                            "width": String(format: "%.0f", door.dimensions.x * 100),
                            "height": String(format: "%.0f", door.dimensions.y * 100),
                        ])
                    }
                    singleRoom["windows"] = windows
                    scannedRooms.append(singleRoom)
                }

                // Export USDZ
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("floorplan.usdz")
                try room.export(to: tempURL)
                let usdzData = try Data(contentsOf: tempURL)
                let base64 = usdzData.base64EncodedString()

                let result: [String: Any] = [
                    "floorPlanData": base64,
                    "mimeType": "model/vnd.usdz+zip",
                    "area": totalArea,
                    "roomCount": scannedRooms.count,
                    "rooms": scannedRooms,
                    "totalWindows": room.windows.count,
                    "totalDoors": room.doors.count,
                ]

                DispatchQueue.main.async {
                    self.savedCall?.resolve(result)
                    self.cleanup()
                }
            } catch {
                DispatchQueue.main.async {
                    self.savedCall?.reject("Failed to process room data: \(error.localizedDescription)")
                    self.cleanup()
                }
            }
        }
    }
    
    // MARK: - Helpers
    
    @available(iOS 17.0, *)
    private func labelForSection(_ section: CapturedRoom.Section, index: Int) -> String {
        // Try to derive a sensible name from the section label
        switch section.label {
        case .livingRoom: return "Woonkamer"
        case .bedroom: return "Slaapkamer \(index + 1)"
        case .bathroom: return "Badkamer"
        case .kitchen: return "Keuken"
        case .diningRoom: return "Eetkamer"
        case .unidentified: return "Ruimte \(index + 1)"
        @unknown default: return "Ruimte \(index + 1)"
        }
    }
    
    @available(iOS 17.0, *)
    private func typeForSection(_ section: CapturedRoom.Section) -> String {
        switch section.label {
        case .livingRoom: return "woonkamer"
        case .bedroom: return "slaapkamer"
        case .bathroom: return "badkamer"
        case .kitchen: return "keuken"
        case .diningRoom: return "woonkamer"
        case .unidentified: return "woonkamer"
        @unknown default: return "woonkamer"
        }
    }
    
    private func isInBounds(_ point: simd_float3, bounds: (min: simd_float3, max: simd_float3)) -> Bool {
        return point.x >= bounds.min.x && point.x <= bounds.max.x &&
               point.z >= bounds.min.z && point.z <= bounds.max.z
    }
    
    private func cleanup() {
        DispatchQueue.main.async {
            self.captureView?.removeFromSuperview()
            self.captureView = nil
            self.captureSession = nil
            self.savedCall = nil
        }
    }
}
