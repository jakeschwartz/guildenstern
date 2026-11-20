import Foundation
import UIKit
import UserNotifications

// Registers the CARD_ACTION category and intercepts Done / Tomorrow / Pass
// so they can run without opening the app. Body taps are forwarded to
// Capacitor (NotificationRouter), which still delivers
// pushNotificationActionPerformed to JS.
//
// Capacitor's Push plugin sets NotificationRouter as the UNUserNotificationCenter
// delegate when the bridge loads, which is after didFinishLaunching. We wrap
// whatever delegate is currently installed, and re-install on become-active
// in case Capacitor overwrites us.
final class CardActionCenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = CardActionCenter()

    static let categoryId = "CARD_ACTION"
    static let doneId = "done"
    static let tomorrowId = "tomorrow"
    static let passId = "pass"
    static let endpoint = URL(string: "https://psthqrdqggqgekqbansb.supabase.co/functions/v1/card-action")!

    private let actionIds: Set<String> = [doneId, tomorrowId, passId]
    private var wrapped: UNUserNotificationCenterDelegate?
    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 12
        config.timeoutIntervalForResource = 12
        return URLSession(configuration: config)
    }()

    private override init() {
        super.init()
    }

    static func registerCategory() {
        let done = UNNotificationAction(
            identifier: doneId,
            title: "Done",
            options: []
        )
        let tomorrow = UNNotificationAction(
            identifier: tomorrowId,
            title: "Tomorrow",
            options: []
        )
        let pass = UNNotificationAction(
            identifier: passId,
            title: "Pass",
            options: [.destructive]
        )
        let category = UNNotificationCategory(
            identifier: categoryId,
            actions: [done, tomorrow, pass],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    // Claim the delegate immediately so a notification action that launched a
    // killed app is handled natively, then retry so we wrap Capacitor's
    // NotificationRouter after the bridge loads (it overwrites the delegate).
    static func start() {
        registerCategory()
        installProxy()
        retryInstall(times: 40)
    }

    static func installProxy() {
        let center = UNUserNotificationCenter.current()
        let current = center.delegate
        if current === shared { return }
        shared.wrapped = current
        center.delegate = shared
    }

    private static func retryInstall(times: Int) {
        installProxy()
        guard times > 0 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            retryInstall(times: times - 1)
        }
    }

    // MARK: - UNUserNotificationCenterDelegate

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if let wrapped {
            wrapped.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
        } else {
            completionHandler([])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let actionId = response.actionIdentifier
        if actionIds.contains(actionId) {
            postAction(actionId, from: response.notification.request.content.userInfo) {
                completionHandler()
            }
            return
        }
        if let wrapped {
            wrapped.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
        } else {
            completionHandler()
        }
    }

    // MARK: - Network

    private func postAction(_ action: String, from userInfo: [AnyHashable: Any], done: @escaping () -> Void) {
        let token = stringValue(userInfo["action_token"] ?? userInfo["action-token"])
        let pushId = stringValue(userInfo["push_id"] ?? userInfo["push-id"])
        let cardId = stringValue(userInfo["card_id"] ?? userInfo["card-id"])
        guard let token, let pushId, let cardId else {
            done()
            return
        }
        var request = URLRequest(url: Self.endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "token": token,
            "action": action,
            "push_id": pushId,
            "card_id": cardId,
        ])
        session.dataTask(with: request) { _, _, _ in
            done()
        }.resume()
    }

    private func stringValue(_ raw: Any?) -> String? {
        if let s = raw as? String, !s.isEmpty { return s }
        if let n = raw as? NSNumber { return n.stringValue }
        return nil
    }
}
