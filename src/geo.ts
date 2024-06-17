export function mercator(lat: number, lon: number): [number, number] {
    return [toRad(lat), Math.log(Math.tan(Math.PI / 4 + toRad(lon) / 2))];
}

const rad_factor = Math.PI / 180.0

function toRad(degree: number): number {
    return degree * rad_factor
}

//https://stackoverflow.com/questions/27928/calculate-distance-between-two-latitude-longitude-points-haversine-formula/21623206#21623206
export function greatCircleDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function greatCircleDistanceCoords(a: Coordinates, b: Coordinates): number {
    return greatCircleDistance(a.latitude, a.longitude, b.latitude, b.longitude)
}

export function coordinatesFromLatLng(lat: number, lon: number): Coordinates {
    return { latitude: lat, longitude: lon }
}