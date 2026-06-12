import Capacitor
import Foundation
import RoomPlan
import UIKit

@objc(RoomPlanScannerPlugin)
public class RoomPlanScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RoomPlanScannerPlugin"
    public let jsName = "RoomPlanScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise)
    ]

    private var scanController: RoomPlanScannerViewController?

    @objc public func isSupported(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["supported": false, "reason": "RoomPlan vereist iOS 16 of hoger"])
            return
        }

        if RoomCaptureSession.isSupported {
            call.resolve(["supported": true])
        } else {
            call.resolve(["supported": false, "reason": "Dit apparaat ondersteunt RoomPlan/LiDAR niet"])
        }
    }

    @objc public func startScan(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("RoomPlan vereist iOS 16 of hoger")
            return
        }

        guard RoomCaptureSession.isSupported else {
            call.reject("Dit apparaat ondersteunt RoomPlan/LiDAR niet")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let presenter = self.bridge?.viewController else {
                call.reject("Kan RoomPlan niet openen: native iOS-viewcontroller ontbreekt")
                return
            }
            guard self.scanController == nil else {
                call.reject("Er loopt al een RoomPlan-scan")
                return
            }

            let controller = RoomPlanScannerViewController(call: call) { [weak self] in
                self?.scanController = nil
            }
            self.scanController = controller
            controller.modalPresentationStyle = .fullScreen
            presenter.present(controller, animated: true)
        }
    }
}

@available(iOS 16.0, *)
private final class RoomPlanScannerViewController: UIViewController, RoomCaptureViewDelegate {
    private let call: CAPPluginCall
    private let onFinish: () -> Void
    private let captureView = RoomCaptureView(frame: .zero)
    private var didComplete = false

    init(call: CAPPluginCall, onFinish: @escaping () -> Void) {
        self.call = call
        self.onFinish = onFinish
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        captureView.translatesAutoresizingMaskIntoConstraints = false
        captureView.delegate = self
        view.addSubview(captureView)

        NSLayoutConstraint.activate([
            captureView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            captureView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            captureView.topAnchor.constraint(equalTo: view.topAnchor),
            captureView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        let cancelButton = UIButton(type: .system)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Annuleer", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        cancelButton.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        cancelButton.layer.cornerRadius = 10
        cancelButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 16, bottom: 10, right: 16)
        cancelButton.addTarget(self, action: #selector(cancelScan), for: .touchUpInside)
        view.addSubview(cancelButton)

        let finishButton = UIButton(type: .system)
        finishButton.translatesAutoresizingMaskIntoConstraints = false
        finishButton.setTitle("Gereed", for: .normal)
        finishButton.setTitleColor(.white, for: .normal)
        finishButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        finishButton.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.9)
        finishButton.layer.cornerRadius = 10
        finishButton.contentEdgeInsets = UIEdgeInsets(top: 10, left: 18, bottom: 10, right: 18)
        finishButton.addTarget(self, action: #selector(finishScan), for: .touchUpInside)
        view.addSubview(finishButton)

        NSLayoutConstraint.activate([
            cancelButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            finishButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            finishButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    @objc private func cancelScan() {
        guard !didComplete else { return }
        didComplete = true
        captureView.captureSession.stop(pauseARSession: true)
        dismiss(animated: true) { [call, onFinish] in
            call.reject("Scan geannuleerd")
            onFinish()
        }
    }

    @objc private func finishScan() {
        guard !didComplete else { return }
        captureView.captureSession.stop(pauseARSession: false)
    }

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        if let error = error {
            rejectAndDismiss(error.localizedDescription)
            return false
        }
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard !didComplete else { return }

        if let error = error {
            rejectAndDismiss(error.localizedDescription)
            return
        }

        do {
            let result = try exportResult(processedResult)
            didComplete = true
            dismiss(animated: true) { [call, onFinish] in
                call.resolve(result)
                onFinish()
            }
        } catch {
            rejectAndDismiss(error.localizedDescription)
        }
    }

    private func rejectAndDismiss(_ message: String) {
        guard !didComplete else { return }
        didComplete = true
        captureView.captureSession.stop(pauseARSession: true)
        dismiss(animated: true) { [call, onFinish] in
            call.reject(message)
            onFinish()
        }
    }

    private func exportResult(_ room: CapturedRoom) throws -> [String: Any] {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("RoomPlanScanner", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let id = UUID().uuidString
        let usdzURL = directory.appendingPathComponent("\(id).usdz")
        let jsonURL = directory.appendingPathComponent("\(id).json")

        try room.export(to: usdzURL, exportOptions: .parametric)

        let jsonData = try JSONEncoder().encode(room)
        try jsonData.write(to: jsonURL, options: .atomic)

        let usdzData = try Data(contentsOf: usdzURL)
        let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"

        return [
            "usdzPath": usdzURL.absoluteString,
            "jsonPath": jsonURL.absoluteString,
            "sizeBytes": usdzData.count,
            "usdzBase64": usdzData.base64EncodedString(),
            "jsonString": jsonString,
            "summary": summary(for: room)
        ]
    }

    private func summary(for room: CapturedRoom) -> [String: Any] {
        let wallArea = room.walls.reduce(0.0) { total, wall in
            total + Double(wall.dimensions.x * wall.dimensions.y)
        }
        let perimeter = room.walls.reduce(0.0) { total, wall in
            total + Double(wall.dimensions.x)
        }
        let ceilingHeight = room.walls.map { Double($0.dimensions.y) }.max() ?? 0.0
        let estimatedFloorArea = ceilingHeight > 0 ? max(wallArea / ceilingHeight, 0.0) : 0.0

        return [
            "wallCount": room.walls.count,
            "doorCount": room.doors.count,
            "windowCount": room.windows.count,
            "openingCount": room.openings.count,
            "objectCount": room.objects.count,
            "floorAreaM2": estimatedFloorArea,
            "ceilingHeightM": ceilingHeight,
            "perimeterM": perimeter
        ]
    }
}