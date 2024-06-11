export function onDomReady(f: () => void) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", f)
    } else {
        f()
    }
}

