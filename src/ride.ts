import { Vector2, Vector3 } from "three";
import { Leg, MovingLeg, Ride, StationaryLeg, TrackPosition, isMovingLeg, isStationaryLeg, path_findOffsetPosition } from "./app";
import { LegLink, firstPoint, firstPosition, lastPoint, lastPosition } from "./leglink";
import { Coordinates, coordinatesFromLatLng, invLerp, remap } from "./util";
import { Stop } from "./stop";

export type Position2d = {
    position: Coordinates
    forward: Vector2
}

function findCurrentLegIndex(ride: Ride, time: number): number {

    const legIndex = ride.legs.findIndex(leg => {
        return time >= leg.startTime && time < leg.endTime
    })
    if (legIndex > 0) return legIndex

    throw new Error("Leg not found")
}

function findPositionOnLink(l: LegLink, fraction: number): Position2d {
    if (l.reversePointOrder) {
        fraction = 1 - fraction;
    }

    const coveredDistance = l.Link.path.pathLength * fraction;
    const points = l.Link.path.points

    for (let pointIndex = 0; pointIndex < l.Link.path.points.length; pointIndex++) {
        const pointDistance = l.Link.path.points[pointIndex].start_offset;
        if (pointDistance > coveredDistance) {
            const leftPoint = points[pointIndex - 1];
            const leftDistance = leftPoint.start_offset

            const rightPoint = points[pointIndex];
            const rightDistance = rightPoint.start_offset

            const pointFraction = remap(coveredDistance, leftDistance, rightDistance, 0, 1);

            const v1 = new Vector2(leftPoint.coordinates.latitude, leftPoint.coordinates.longitude);
            const v2 = new Vector2(rightPoint.coordinates.latitude, rightPoint.coordinates.longitude);
            const position = v1.lerp(v2, pointFraction);

            const forward = v2.clone().sub(v1).normalize()
            if (!l.reversePointOrder) {
                forward.multiplyScalar(-1);
            }

            return {
                position: coordinatesFromLatLng(position.x, position.y),
                forward
            };
        }
    }
    throw new Error("Point not found")
}

function findCurrentPositionOnLeg(leg: MovingLeg, time: number): TrackPosition {
    const fraction = remap(time, leg.startTime, leg.endTime, 0, 1);

    if (fraction < 0 || fraction > 1) {
        throw new Error("Unexpected fraction")
    }

    const totalLegLength = leg.links.reduce((acc, cur) => acc + cur.Link.path.pathLength, 0);

    const coveredLegDistance = fraction * totalLegLength;

    return findCurrentLink(leg, coveredLegDistance)
}

function realizeTrackPosition(pos: TrackPosition): Position2d {
    const leglink = pos.leglink;
    let offset = pos.offset;

    const isReverse = pos.leglink.reversePointOrder;
    const length = pos.leglink.Link.path.pathLength;
    if (isReverse) {
        offset = length - offset
    }

    const pos2d = path_findOffsetPosition(leglink.Link.path.points, offset)

    if (isReverse) {
        pos2d.forward.multiplyScalar(-1)
    }

    return pos2d;
}



function findCurrentLink(leg: MovingLeg, coveredLegDistance: number): TrackPosition {
    let distanceSum = 0;
    for (let index = 0; index < leg.links.length; index++) {
        const link = leg.links[index];

        if (coveredLegDistance > distanceSum && coveredLegDistance < distanceSum + link.Link.path.pathLength) {
            return { leglink: link, offset: coveredLegDistance - distanceSum };
        }
        distanceSum += link.Link.path.pathLength

    }
    throw new Error("Link not found")
}

export function isActiveAtTime(ride: Ride, time: number): boolean {
    return time >= ride.startTime && time < ride.endTime
}

function trackPositionForStation(lastLeg: MovingLeg | undefined, nextLeg?: MovingLeg): TrackPosition {
    // TODO Redo and figure out rotation as well

    if (lastLeg != undefined) {
        return lastPosition(lastLeg.links[lastLeg.links.length - 1]);
    }
    if (nextLeg != undefined) {
        return firstPosition(lastLeg.links[0]);
    }

    throw new Error("Unreachable");
}

export function trainPosition(ride: Ride, time: number): TrackPosition {
    if (!isActiveAtTime(ride, time)) {
        throw new Error("Cannot get position of train outside schedule times");
    }


    const currentLegIndex = findCurrentLegIndex(ride, time);
    const currentLeg = ride.legs[currentLegIndex];

    switch (currentLeg.stationary) {
        case true: {
            // SAFETY if currentleg is stationary, the next and previous legs will be either a movingLeg or undefined

            const previousLeg = ride.legs[currentLegIndex - 1] as MovingLeg | undefined
            const nextLeg = ride.legs[currentLegIndex + 1] as MovingLeg | undefined

            return trackPositionForStation(previousLeg, nextLeg)
        }
        case false: {
            return findCurrentPositionOnLeg(currentLeg, time);

        }
    }

    throw new Error("Unreachable")
}

export function realPosition(leg: TrackPosition): Position2d {
    return realizeTrackPosition(leg);


    // position
    // findCurrentPositionOnLeg(leg.leglink, time)
}

export function getStops(legs: Leg[]): Stop[] {
    return legs.filter(isStationaryLeg).map(l => {
        return {
            code: l.station.code,
            ArrivalTime: l.startTime,
            DepartureTime: l.endTime,
            stopType: l.stopType,
            platform: l.platforms,
            TripDistance: 0
        }
    });
}
