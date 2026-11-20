import Foundation
import ObjectiveC
import UIKit
import UserNotifications

// Registers the CARD_ACTION category and intercepts Done / Tomorrow / Pass
// so they can run without opening the app. Body taps are forwarded to
// Capacitor (NotificationRouter), which still delivers
// pushNotificationActionPerformed to JS and keeps token registration on the
// AppDelegate path.
//
// Capacitor's Push plugin sets NotificationRouter as the UNUserNotificationCenter
// delegate when the bridge loads, which is after didFinishLaunching, and iOS
// delivers a cold-start tap only once. We stay the delegate: any other setter
// is captured and wrapped, and a body tap that arrives before that wrap is
// held and forwarded instead of being completed empty.
final class CardActionCenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = CardActionCenter()

    static let categoryId = "CARD_ACTION"
    static let doneId = "done"
    static let tomorrowId = "tomorrow"
    static let passId = "pass"
    static let endpoint = URL(string: "https://psthqrdqggqgekqbansb.supabase.co/functions/v1/card-action")!

    private let actionIds: Set<String> = [doneId, tomorrowId, passId]
    private var wrapped: UNUserNotificationCenterDelegate?
    private var pending: [(UNNotificationResponse, () -> Void)] = []
    private var acceptPending = true
    private var flushing = false
    private static var originalSetDelegate: IMP?
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
        let done = UNNotificationAction(identifier: doneId, title: "Done", options: [])
        let tomorrow = UNNotificationAction(identifier: tomorrowId, title: "Tomorrow", options: [])
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
        let center = UNUserNotificationCenter.current()
        // Merge. setNotificationCategories replaces the whole set, and
        // Set.filter returns an Array.
        center.getNotificationCategories { existing in
            var next = Set(existing.filter { $0.identifier != categoryId })
            next.insert(category)
            center.setNotificationCategories(next)
        }
    }

    // Claim the delegate immediately so a notification action that launched a
    // killed app is handled natively, and keep Capacitor's router behind us
    // whenever it installs itself.
    static func start() {
        swizzleDelegateSetter()
        registerCategory()
        installProxy()
        retryInstall(times: 40)
    }

    static func installProxy() {
        let center = UNUserNotificationCenter.current()
        let current = center.delegate
        if current === shared {
            shared.flushPending()
            return
        }
        if let current {
            shared.wrapped = current
        }
        center.delegate = shared
        shared.flushPending()
    }

    /// Whenever something else becomes the notification delegate, keep it as
    /// the forward target and put ourselves back. Closes the gap where a
    /// cold-start tap is delivered to Capacitor before the 50ms poll runs,
    /// or delivered to us before Capacitor exists and then dropped.
    private static func swizzleDelegateSetter() {
        guard originalSetDelegate == nil else { return }
        let cls: AnyClass = UNUserNotificationCenter.self
        let sel = NSSelectorFromString("setDelegate:")
        guard let method = class_getInstanceMethod(cls, sel) else { return }
        let original = method_getImplementation(method)
        originalSetDelegate = original
        let block: @convention(block) (UNUserNotificationCenter, UNUserNotificationCenterDelegate?) -> Void = { center, delegate in
            guard let saved = CardActionCenter.originalSetDelegate else { return }
            let call = unsafeBitCast(
                saved,
                to: (@convention(c) (AnyObject, Selector, UNUserNotificationCenterDelegate?) -> Void).self
            )
            if let delegate, (delegate as AnyObject) !== CardActionCenter.shared {
                CardActionCenter.shared.wrapped = delegate
                call(center, sel, CardActionCenter.shared)
                CardActionCenter.shared.flushPending()
            } else {
                call(center, sel, delegate)
            }
        }
        method_setImplementation(method, imp_implementationWithBlock(block))
    }

    private static func retryInstall(times: Int) {
        installProxy()
        guard times > 0 else {
            // Don't hold iOS's completion handler forever if the bridge never
            // attaches. The tap is only dropped in that failure case.
            shared.dropPending()
            return
        }
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
        let sel = NSSelectorFromString("userNotificationCenter:willPresentNotification:withCompletionHandler:")
        if let wrapped, (wrapped as AnyObject).responds(to: sel) {
            wrapped.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
        } else {
            // An unwrapped proxy must not swallow a foreground notification.
            completionHandler([.banner, .list, .sound, .badge])
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
        forward(response, from: center, completion: completionHandler)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        openSettingsFor notification: UNNotification?
    ) {
        wrapped?.userNotificationCenter?(center, openSettingsFor: notification)
    }

    private func forward(
        _ response: UNNotificationResponse,
        from center: UNUserNotificationCenter,
        completion: @escaping () -> Void
    ) {
        if let wrapped {
            deliver(response, to: wrapped, from: center, completion: completion)
        } else if acceptPending {
            pending.append((response, completion))
        } else {
            completion()
        }
    }

    private func deliver(
        _ response: UNNotificationResponse,
        to delegate: UNUserNotificationCenterDelegate,
        from center: UNUserNotificationCenter,
        completion: @escaping () -> Void
    ) {
        let sel = NSSelectorFromString("userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:")
        if (delegate as AnyObject).responds(to: sel) {
            delegate.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completion)
        } else {
            completion()
        }
    }

    fileprivate func flushPending() {
        guard !flushing, let wrapped else { return }
        acceptPending = true
        flushing = true
        defer { flushing = false }
        let queued = pending
        pending.removeAll()
        let center = UNUserNotificationCenter.current()
        for (response, completion) in queued {
            deliver(response, to: wrapped, from: center, completion: completion)
        }
    }

    fileprivate func dropPending() {
        guard wrapped == nil else { return }
        acceptPending = false
        let queued = pending
        pending.removeAll()
        for (_, completion) in queued {
            completion()
        }
    }

    // MARK: - Network

    private func postAction(_ action: String, from userInfo: [AnyHashable: Any], done: @escaping () -> Void) {
        let token = stringValue(userInfo["action_token"] ?? userInfo["action-token"])
        let pushId = stringValue(userInfo["push_id"] ?? userInfo["push-id"])
        let cardId = stringValue(userInfo["card_id"] ?? userInfo["card-id"])
        guard let token, let pushId, let cardId,
              let body = try? JSONSerialization.data(withJSONObject: [
                "token": token,
                "action": action,
                "push_id": pushId,
                "card_id": cardId,
              ])
        else {
            done()
            return
        }

        var request = URLRequest(url: Self.endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let app = UIApplication.shared
        let taskBox = TaskBox()
        let gate = Once()
        let finish: () -> Void = {
            let run = {
                gate.run {
                    done()
                    if taskBox.id != .invalid {
                        let id = taskBox.id
                        taskBox.id = .invalid
                        app.endBackgroundTask(id)
                    }
                }
            }
            if Thread.isMainThread {
                run()
            } else {
                DispatchQueue.main.async(execute: run)
            }
        }
        taskBox.id = app.beginBackgroundTask(withName: "card-action", expirationHandler: finish)

        func send(attempt: Int) {
            session.dataTask(with: request) { _, response, error in
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                let retryable = error != nil || status == 0 || status >= 500
                if retryable && attempt == 0 && !gate.hasRun {
                    send(attempt: 1)
                    return
                }
                finish()
            }.resume()
        }
        send(attempt: 0)
    }

    private func stringValue(_ raw: Any?) -> String? {
        if let s = raw as? String, !s.isEmpty { return s }
        if let n = raw as? NSNumber { return n.stringValue }
        return nil
    }
}

/// Runs its body at most once. The notification completion handler and the
/// background-task expiration handler can both fire. The body runs outside
/// the lock so ending the task cannot deadlock on a re-entrant expiration.
private final class Once {
    private var didRun = false
    private let lock = NSLock()

    var hasRun: Bool {
        lock.lock()
        defer { lock.unlock() }
        return didRun
    }

    func run(_ body: () -> Void) {
        lock.lock()
        if didRun {
            lock.unlock()
            return
        }
        didRun = true
        lock.unlock()
        body()
    }
}

private final class TaskBox {
    var id = UIBackgroundTaskIdentifier.invalid
}
