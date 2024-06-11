import { Vector2 } from "three";
import { inverseLerp, lerp } from "../number";
import { Coordinates, greatCircleDistanceCoords } from "../util";
import { Position2d } from "./ride";


export function pathFromCoordinateArray(coords: Coordinates[]): Path {
    // console.log("IN")
    // console.log(coords,coords.length);
    if (coords.length < 2) {
        throw new Error("Expected path to have at least 2 elements");
    }

    const out: Path["points"] = [{ start_offset: 0, coordinates: coords[0] }];

    let sum = 0;
    // Note index = 1!
    for (let index = 1; index < coords.length; index++) {
        const lastElement = coords[index - 1];
        const element = coords[index];

        sum += greatCircleDistanceCoords(lastElement, element);
        out.push({ coordinates: element, start_offset: sum });
    }

    return {
        pathLength: sum,
        points: out
    };
} export function path_findOffsetPosition(path: PathPoint[], offset: number): Position2d {
    const [lowElement, highElement] = path_findOffsetSpan(path, offset)

    let fraction = inverseLerp(lowElement.start_offset, highElement.start_offset, offset)

    let latitude = lerp(lowElement.coordinates.latitude, highElement.coordinates.latitude, fraction)
    let longitude = lerp(lowElement.coordinates.longitude, highElement.coordinates.longitude, fraction)

    let from = new Vector2(lowElement.coordinates.latitude, lowElement.coordinates.longitude)
    let to = new Vector2(highElement.coordinates.latitude, highElement.coordinates.longitude)

    from.sub(to).normalize()

    return {
        position: { latitude, longitude },
        forward: from
    }
}

export type PathJSON = { points: { coordinates: Coordinates }[] }
/**
 * Find the element before and after the given offset
 */
export function path_findOffsetSpan(path: PathPoint[], offset: number): [PathPoint, PathPoint] {
    for (let index = 0; index < path.length - 1; index++) { // Note length-1
        const lowElement = path[index]
        const highElement = path[index + 1]

        // Note, inclusive on both ends
        if (offset >= lowElement.start_offset && offset <= highElement.start_offset) {
            return [lowElement, highElement]
        }
    }

    // Span must be found, if not the offset or path is invalid
    throw new Error("span not found")
}
export type PathPoint = {
    coordinates: Coordinates
    start_offset: number
}

export type Path = {
    points: PathPoint[]
    pathLength: number
}

