import Cocoa
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem?
    var serverProcess: Process?
    var clientProcess: Process?
    var isRunning = false

    // Path to harkive root — sibling of this app bundle
    var harkivePath: String {
        let bundleDir = Bundle.main.bundlePath
        // When built, app is inside menubar/HarkiveBar/build/... or beside the harkive folder
        // Fall back to hardcoded path
        let candidates = [
            (bundleDir as NSString).deletingLastPathComponent + "/../../..",
            NSHomeDirectory() + "/harkive",
        ]
        for c in candidates {
            let expanded = (c as NSString).standardizingPath
            if FileManager.default.fileExists(atPath: expanded + "/server/index.js") {
                return expanded
            }
        }
        return NSHomeDirectory() + "/harkive"
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupStatusItem()
        startHarkive()
    }

    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem?.button {
            if let img = NSImage(named: "MenuBarIcon") {
                img.isTemplate = true
                img.size = NSSize(width: 16, height: 16)
                button.image = img
            } else {
                button.title = "H"
            }
            button.action = #selector(handleClick)
            button.target = self
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
    }

    @objc func handleClick() {
        let event = NSApp.currentEvent
        if event?.type == .rightMouseUp {
            showMenu()
        } else {
            if isRunning {
                openBrowser()
            } else {
                startHarkive()
            }
        }
    }

    func showMenu() {
        let menu = NSMenu()
        if isRunning {
            let open = NSMenuItem(title: "Open Harkive", action: #selector(openBrowser), keyEquivalent: "o")
            open.target = self
            menu.addItem(open)
            menu.addItem(.separator())
            let stop = NSMenuItem(title: "Stop Server", action: #selector(stopHarkive), keyEquivalent: "")
            stop.target = self
            menu.addItem(stop)
        } else {
            let start = NSMenuItem(title: "Start Harkive", action: #selector(startHarkive), keyEquivalent: "")
            start.target = self
            menu.addItem(start)
        }
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit HarkiveBar", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        statusItem?.menu = menu
        statusItem?.button?.performClick(nil)
        statusItem?.menu = nil
    }

    @objc func startHarkive() {
        guard !isRunning else { openBrowser(); return }

        var env = ProcessInfo.processInfo.environment
        let envFile = harkivePath + "/.env"
        if let contents = try? String(contentsOfFile: envFile, encoding: .utf8) {
            for line in contents.components(separatedBy: "\n") {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                guard !trimmed.hasPrefix("#"), !trimmed.isEmpty else { continue }
                let parts = trimmed.components(separatedBy: "=")
                if parts.count >= 2 {
                    env[parts[0]] = parts.dropFirst().joined(separator: "=")
                }
            }
        }

        // Start Node server
        let server = Process()
        server.executableURL = nodeURL()
        server.arguments = [harkivePath + "/server/index.js"]
        server.environment = env
        server.currentDirectoryURL = URL(fileURLWithPath: harkivePath + "/server")
        do { try server.run() } catch { print("Server start error:", error) }
        serverProcess = server

        // Start Vite client after 1.5s
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            let client = Process()
            client.executableURL = self.npmURL()
            client.arguments = ["run", "dev"]
            client.environment = env
            client.currentDirectoryURL = URL(fileURLWithPath: self.harkivePath + "/client")
            do { try client.run() } catch { print("Client start error:", error) }
            self.clientProcess = client
        }

        // Open browser after 3.5s
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
            self.openBrowser()
        }

        isRunning = true
        updateIcon()
    }

    @objc func stopHarkive() {
        serverProcess?.terminate()
        clientProcess?.terminate()
        serverProcess = nil
        clientProcess = nil
        isRunning = false
        updateIcon()
        // Kill any orphaned port processes
        let cleanup = Process()
        cleanup.executableURL = URL(fileURLWithPath: "/bin/sh")
        cleanup.arguments = ["-c", "lsof -ti:3001,5173 | xargs kill -9 2>/dev/null; true"]
        try? cleanup.run()
    }

    @objc func openBrowser() {
        NSWorkspace.shared.open(URL(string: "http://localhost:5173")!)
    }

    @objc func quitApp() {
        stopHarkive()
        NSApp.terminate(nil)
    }

    func updateIcon() {
        DispatchQueue.main.async {
            self.statusItem?.button?.alphaValue = self.isRunning ? 1.0 : 0.45
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopHarkive()
    }

    // Locate node/npm — check nvm and homebrew paths
    func nodeURL() -> URL {
        let candidates = [
            NSHomeDirectory() + "/.nvm/versions/node/\(nvmDefault())/bin/node",
            "/usr/local/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/bin/node",
        ]
        for c in candidates where FileManager.default.fileExists(atPath: c) {
            return URL(fileURLWithPath: c)
        }
        return URL(fileURLWithPath: "/usr/local/bin/node")
    }

    func npmURL() -> URL {
        let dir = (nodeURL().path as NSString).deletingLastPathComponent
        let npm = dir + "/npm"
        if FileManager.default.fileExists(atPath: npm) { return URL(fileURLWithPath: npm) }
        return URL(fileURLWithPath: "/usr/local/bin/npm")
    }

    func nvmDefault() -> String {
        let aliasPath = NSHomeDirectory() + "/.nvm/alias/default"
        return (try? String(contentsOfFile: aliasPath, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}
