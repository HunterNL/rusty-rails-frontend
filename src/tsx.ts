function escapeStrings(elemOrString: Node | string): Node {
    if (typeof elemOrString == "string") {
        return document.createTextNode(elemOrString)
    }
    return elemOrString
}


export function renderElement(tag: keyof HTMLElementTagNameMap, props: Record<string, any>, ...children: any[]): HTMLElement {
    const elem = document.createElement(tag);

    for (const child of children) {
        if (Array.isArray(child)) {
            for (const item of child) {
                elem.appendChild(escapeStrings(item))
            }
            continue

        }
        if (typeof child == "string") {
            elem.appendChild(document.createTextNode(child))
            continue
        }

        if (child instanceof Element) {
            elem.appendChild(child)
            continue
        }


        throw new Error("Child is not a string or array")
    }

    for (const [key, value] of Object.entries(props)) {
        if (key == "innerHTML" || key == "prototype" || key == "__proto__") { // TODO Whitelist or something?
            continue
        }
        if (key == "class") {
            elem.className = value
            continue
        }
        if(key == "style") {
            applyElemStyle(elem,value)
            continue
        }
        elem[key] = value
    }


    return elem
}


export const JSXFactory = {
    CreateElement: renderElement
}

function applyElemStyle(elem: HTMLElement, style: CSSStyleDeclaration) {
    for (const [key,value] of Object.entries(style)) {
        elem.style[key]=value
    }
}
