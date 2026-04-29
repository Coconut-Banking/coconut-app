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
      NSLog("[PRD] iOS < 18, rejecting UNSUPPORTED")
      reject("UNSUPPORTED", "ProximityReaderDiscovery requires iOS 18.0 or later", nil)
    }
  }

  @available(iOS 18.0, *)
  @MainActor
  private func doPresentEducation(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) async {
    NSLog("[PRD] doPresentEducation start")

    let discovery = ProximityReaderDiscovery()
    NSLog("[PRD] fetching contentList (10s timeout)")

    // Race contentList against a 10-second timeout.
    // On development builds, contentList may hang if Apple's servers don't
    // authorise the dev entitlement for content delivery. The timeout ensures
    // the promise resolves and JS can show the custom fallback screen.
    let items: [ProximityReaderDiscovery.Content]
    do {
      items = try await withThrowingTaskGroup(
        of: Optional<[ProximityReaderDiscovery.Content]>.self
      ) { group in
        group.addTask {
          NSLog("[PRD] contentList network task start")
          let result = try await discovery.contentList
          NSLog("[PRD] contentList resolved, count=\(result.count)")
          return result
        }
        group.addTask {
          try await Task.sleep(nanoseconds: 10_000_000_000) // 10 s
          NSLog("[PRD] timeout — contentList did not return in 10s")
          return nil // nil signals timeout
        }

        // Whichever finishes first wins; cancel the other.
        let first = try await group.next()!
        group.cancelAll()
        return first ?? [] // nil (timeout) → empty list → JS fallback
      }
    } catch is CancellationError {
      NSLog("[PRD] cancelled — resolving nil for JS fallback")
      resolve(nil)
      return
    } catch {
      NSLog("[PRD] contentList error: \(error.localizedDescription)")
      reject("ERROR", error.localizedDescription, error)
      return
    }

    NSLog("[PRD] contentList done, count=\(items.count)")

    guard !items.isEmpty else {
      NSLog("[PRD] empty list (timeout or no content) — resolving nil for JS fallback")
      resolve(nil)
      return
    }

    guard
      let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive }),
      let keyWindow = scene.keyWindow
    else {
      NSLog("[PRD] no active window scene")
      reject("NO_WINDOW", "No active window scene found", nil)
      return
    }

    var topVC = keyWindow.rootViewController ?? UIViewController()
    while let presented = topVC.presentedViewController {
      topVC = presented
    }
    NSLog("[PRD] presenting \(items.count) content item(s) from \(type(of: topVC))")

    do {
      for (idx, item) in items.enumerated() {
        NSLog("[PRD] showing item \(idx + 1)/\(items.count)")
        try await discovery.presentContent(item, from: topVC)
        NSLog("[PRD] item \(idx + 1) dismissed by user")
        var next = keyWindow.rootViewController ?? topVC
        while let presented = next.presentedViewController {
          next = presented
        }
        topVC = next
      }
      NSLog("[PRD] all items presented — resolving")
      resolve(nil)
    } catch {
      NSLog("[PRD] presentContent error: \(error.localizedDescription)")
      reject("ERROR", error.localizedDescription, error)
    }
  }
}
