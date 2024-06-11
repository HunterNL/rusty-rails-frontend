

export function harvest(form: HTMLElement): Record<string, any> {
    const out = {};
    form.querySelectorAll("[data-field]").forEach(e => {
        const key = (e as HTMLElement).dataset.field;
        const value = harvestElement(e as HTMLElement);

        out[key] = value;
    });
    return out;
} export function harvestElement(elem: HTMLElement): any {
    return (elem as any).value
}

