import UIKit
import Capacitor

// Apps built with the iOS 27 SDK must use the UIScene life cycle or UIKit
// refuses to launch them. The window and CAPBridgeViewController still come
// from Main.storyboard, now via the scene manifest in Info.plist.
//
// With scenes, URL opens and universal links are delivered here instead of to
// AppDelegate, so forward them to Capacitor the same way AppDelegate used to.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Cold launch from a link: record it so App.getLaunchUrl() still sees it.
        if let url = connectionOptions.urlContexts.first?.url {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
        }
        if let userActivity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // iOS 16.4+: opt the WKWebView into Web Inspector. Off by default in
        // release builds. Without this, Safari Develop menu shows
        // "No inspectable contents" for the app.
        if #available(iOS 16.4, *) {
            if let bridgeVC = window?.rootViewController as? CAPBridgeViewController {
                bridgeVC.webView?.isInspectable = true
            }
        }
    }
}
