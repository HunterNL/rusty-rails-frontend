export function remap(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number): number {
    return toLow + (value - fromLow) * (toHigh - toLow) / (fromHigh - fromLow)
}

export function joinWith<T, U>(r: T[], f: (a: T, B: T) => U): U[] {
    const out = [];
    for (let index = 0; index < r.length - 1; index++) {
        out[index] = f(r[index], r[index + 1])
    }
    return out
}

export function onDomReady(f: () => void) {
    if (document.readyState == "loading") {
        document.addEventListener("DOMContentLoaded", f)
    } else {
        f()
    }
}

//https://stackoverflow.com/questions/27928/calculate-distance-between-two-latitude-longitude-points-haversine-formula/21623206#21623206
export function greatCircleDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    var p = 0.017453292519943295;    // Math.PI / 180
    var c = Math.cos;
    var a = 0.5 - c((lat2 - lat1) * p) / 2 +
        c(lat1 * p) * c(lat2 * p) *
        (1 - c((lon2 - lon1) * p)) / 2;

    return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
}

export type Coordinates = {
    latitude: number,
    longitude: number
}

export function coordinatesFromLatLng(lat:number,lon:number): Coordinates {
    return {latitude:lat,longitude:lon}
}