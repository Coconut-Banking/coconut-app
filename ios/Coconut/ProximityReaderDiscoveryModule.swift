import Foundation
import React
import ProximityReader

// Bridges Apple's ProximityReaderDiscovery API to JS.
// Presents Apple's official "How to use Tap to Pay on iPhone" merchant education UI.
// Available on iOS 18.0+ only; older devices fall back to our custom education screen.
@objc(ProximityReaderDiscoveryModule)
class ProximityReaderDiscoveryModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc func presentEducation(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 18.0, *) {
      Task { @MainActor in
        await self.doPresentEducation(resolve: resolve, reject: reject)
      }
    } else {
      reject("UNSUPPORTED", "ProximityReaderDiscovery requires iOS 18.0 or later", nil)
    }
  }

  @available(iOS 18.0, *)
  @MainActor
  private func doPresentEducation(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) async {
    do {
      let discovery = ProximityReaderDiscovery()

      // Use contentList so we present all regional content (satisfies 4.4 + 4.5)
      let items = try await discovery.contentList
      guard !items.isEmpty else {
        // No content available for this device/region — resolve so JS falls back gracefully
        resolve(nil)
        return
      }

      guard
        let scene = UIApplication.shared.connectedScenes
          .compactMap({ $0 as? UIWindowScene })
          .first(where: { $0.activationState == .foregroundActive }),
        let keyWindow = scene.keyWindow
      else {
        reject("NO_WINDOW", "No active window scene found", nil)
        return
      }

      var topVC = keyWindow.rootViewController ?? UIViewController()
      while let presented = topVC.presentedViewController {
        topVC = presented
      }

      for item in items {
        try await discovery.presentContent(item, from: topVC)
        // After dismissal, walk again to the topmost VC in case navigation changed
        var next = keyWindow.rootViewController ?? topVC
        while let presented = next.presentedViewController {
          next = presented
        }
        topVC = next
      }

      resolve(nil)
    } catch {
      reject("ERROR", error.localizedDescription, error)
    }
  }
}
