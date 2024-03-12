const zeroCode = "0".charCodeAt(0)
const nineCode = "9".charCodeAt(0);

export function isDigit(s: string): boolean {
    const charcode = s.charCodeAt(0);
    return charcode >= zeroCode && charcode <= nineCode
}

export function inverseLerp(min:number,max:number,a:number): number {
    return (a-min)/(max-min)
}