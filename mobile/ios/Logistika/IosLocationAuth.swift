import CoreLocation
import React
import UIKit

/// Distinguishes Always vs When-In-Use. react-native-geolocation-service maps both to "granted"
/// and never calls requestAlwaysAuthorization() after When-In-Use is already approved.
@objc(IosLocationAuth)
class IosLocationAuth: RCTEventEmitter, CLLocationManagerDelegate {
  private var pending: RCTPromiseResolveBlock?
  private var hasListeners = false
  private lazy var manager: CLLocationManager = {
    let instance = CLLocationManager()
    instance.delegate = self
    return instance
  }()

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["iosLocationAuthChanged"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc func getStatus(
    _ resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    resolve(IosLocationAuth.statusString())
  }

  @objc func requestAlways(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    if !CLLocationManager.locationServicesEnabled() {
      resolve("disabled")
      return
    }

    switch IosLocationAuth.currentStatus() {
    case .authorizedAlways:
      resolve("always")
      return
    case .denied:
      resolve("denied")
      return
    case .restricted:
      resolve("restricted")
      return
    default:
      break
    }

    // Warm the manager so its initial auth callback is not treated as the user answer.
    _ = manager
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        resolve(IosLocationAuth.statusString())
        return
      }
      if IosLocationAuth.currentStatus() == .authorizedAlways {
        resolve("always")
        return
      }
      self.pending = resolve
      self.manager.requestAlwaysAuthorization()
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    emitStatus()
    finishIfPending()
  }

  func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
    if status == .notDetermined {
      return
    }
    emitStatus()
    finishIfPending()
  }

  private func emitStatus() {
    guard hasListeners else {
      return
    }
    sendEvent(withName: "iosLocationAuthChanged", body: IosLocationAuth.statusString())
  }

  private func finishIfPending() {
    guard let pending else {
      return
    }
    let status = IosLocationAuth.currentStatus()
    if status == .notDetermined {
      return
    }
    self.pending = nil
    pending(IosLocationAuth.statusString())
  }

  private static func currentStatus() -> CLAuthorizationStatus {
    if #available(iOS 14.0, *) {
      return CLLocationManager().authorizationStatus
    }
    return CLLocationManager.authorizationStatus()
  }

  private static func statusString() -> String {
    if !CLLocationManager.locationServicesEnabled() {
      return "disabled"
    }
    switch currentStatus() {
    case .authorizedAlways:
      return "always"
    case .authorizedWhenInUse:
      return "whenInUse"
    case .restricted:
      return "restricted"
    case .denied:
      return "denied"
    default:
      return "undetermined"
    }
  }
}
