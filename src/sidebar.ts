const MIN_DRAG_TO_DISMISS = 200

export class Sidebar {
    style: string
    constructor(public element: HTMLElement) {
        if (!(element instanceof HTMLElement)) {
            throw new Error("Sidebar constructor requires an HTMLELement argument")
        }
        this.addSwipeListener()
    }

    public renderIntoContentField(key: string, value) {
        const sidebar = document.getElementById("sidebar")
        sidebar.querySelector(`[data-field='${key}']`).textContent = value
    }

    public renderIntoChild(key: string, newNode: Node) {
        const sidebar = document.getElementById("sidebar")
        sidebar.querySelector(`[data-field='${key}']`).replaceChildren(newNode)
    }

    private addSwipeListener() {
        let touchStartY = 0

        function onStart(e: TouchEvent) {
            touchStartY = e.targetTouches[0].clientY

            this.element.style.transition = "transform .015s"
        }

        function onMove(e: TouchEvent) {
            const currentY = e.targetTouches[0].clientY
            this.element.style.transform = "translate3d(0," + Math.max(0, currentY - touchStartY) + "px,0)"
        }

        function onEnd(e: TouchEvent) {
            const currentY = e.changedTouches[0].clientY
            const difference = currentY - touchStartY

            this.element.style.transform = null
            this.element.style.transition = "transform .2s"

            if (difference > MIN_DRAG_TO_DISMISS) {
                this.element.classList.remove('visible')
            }
        }

        this.element.addEventListener("touchstart", onStart, { passive: true })
        this.element.addEventListener("touchmove", onMove, { passive: true })
        this.element.addEventListener("touchend", onEnd, { passive: true })
    }

    reveal(style: string) {
        this.style=style;
        this.element.classList.add("visible")
        this.element.classList.add(style)
    }

    hide() {
        this.element.classList.remove("visible");
        this.element.classList.remove(this.style);
        this.style = "";
    }

}

