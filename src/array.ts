

export function joinWith<T, U>(r: T[], f: (a: T, B: T) => U): U[] {
    const out = [];
    for (let index = 0; index < r.length - 1; index++) {
        out[index] = f(r[index], r[index + 1])
    }
    return out
}

