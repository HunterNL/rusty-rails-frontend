export function mercator(lat:number, lon:number) {
    return [toRad(lat), Math.log(Math.tan(Math.PI / 4 + toRad(lon) / 2))];
}

const rad_factor = Math.PI / 180.0

function toRad(degree:number): number {
    return degree * rad_factor
}