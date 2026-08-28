import UIKit
import React
import FirebaseCore

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, RCTBridgeDelegate {

  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil,
       FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }

    let bridge = RCTBridge(delegate: self, launchOptions: launchOptions)
    let rootView = RCTRootView(bridge: bridge!, moduleName: "Logistika", initialProperties: nil)

    self.window = UIWindow(frame: UIScreen.main.bounds)
    let rootViewController = UIViewController()
    rootViewController.view = rootView
    self.window?.rootViewController = rootViewController
    self.window?.makeKeyAndVisible()

    return true
  }

  func sourceURL(for bridge: RCTBridge!) -> URL! {
    #if DEBUG
    if let provider = RCTBundleURLProvider.sharedSettings() {
      #if targetEnvironment(simulator)
      // The demo stack deliberately avoids Metro's default 8081 port.
      // Keep a manually selected Dev Menu host, otherwise use the documented demo port.
      if provider.jsLocation?.isEmpty != false {
        provider.jsLocation = "localhost:8083"
      }
      #endif
      if let bundleURL = provider.jsBundleURL(forBundleRoot: "index") {
        return bundleURL
      }
    }
    return URL(string: "http://localhost:8083/index.bundle?platform=ios&dev=true")!
    #else
    if let bundleURL = Bundle.main.url(forResource: "main", withExtension: "jsbundle") {
      return bundleURL
    }
    return URL(string: "http://localhost:8081/index.bundle?platform=ios&dev=true")!
    #endif
  }
}
