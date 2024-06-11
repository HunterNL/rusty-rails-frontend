const zeroCode = "0".charCodeAt(0)
const nineCode = "9".charCodeAt(0);

export function isDigit(s: string): boolean {
    const charcode = s.charCodeAt(0);
    return charcode >= zeroCode && charcode <= nineCode
}

export function inverseLerp(min: number, max: number, a: number): number {
    return (a - min) / (max - min)
}

export function lerp(min: number, max: number, a: number): number {
    return min + a * (max - min)
}

export function remap(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number): number {
    return toLow + (value - fromLow) * (toHigh - toLow) / (fromHigh - fromLow)
}
