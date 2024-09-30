export function originatesFromForm(e: KeyboardEvent) {
    let cur = e.target as HTMLElement; // Find the element where the event originates
    while (true) {
        if (cur.tagName === "FORM") {
            return true;
        }

        if (!cur.parentElement) {
            return false;
        } else {
            cur = cur.parentElement;
        }
    }


}
