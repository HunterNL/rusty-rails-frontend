import { Vec2, Vector2, Vector3 } from "three";
import { Leg, LegLink, MovingLeg, Ride, StationaryLeg, isStationaryLeg } from "./app";
import { Coordinates, coordinatesFromLatLng, remap } from "./util";
import { Stop } from "./stop";

type Position2d = {
    position: Coordinates
    forward: Vec2
}

function findCurrentLeg(ride: Ride, time: number): Leg {

    const leg = ride.legs.find(leg => {
        return time >= leg.startTime && time < leg.endTime
    })
    if (leg) return leg

    throw new Error("Leg not found")
}

function findPositionOnLink(l: LegLink, fraction: number): Position2d {
    if (l.reversePointOrder) {
        fraction = 1 - fraction;
    }

    const coveredDistance = l.Link.path.len * fraction;
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
                position: coordinatesFromLatLng(position.x,position.y),
                forward
            };
        }
    }
    throw new Error("Point not found")
}

function findCurrentPositionOnLeg(leg: MovingLeg, time: number): Position2d {
    const fraction = remap(time, leg.startTime, leg.endTime, 0, 1);

    const totalLegLength = leg.links.reduce((acc, cur) => acc + cur.Link.path.len, 0);
    const coveredLegDistance = fraction * totalLegLength;

    const { l, linkFraction } = findCurrentLink(leg, coveredLegDistance)
    return findPositionOnLink(l, linkFraction)

}


function findCurrentLink(leg: MovingLeg, coveredLegDistance: number): { l: LegLink, linkFraction: number } {
    let distanceSum = 0;
    for (let index = 0; index < leg.links.length; index++) {
        const link = leg.links[index];

        if (coveredLegDistance > distanceSum && coveredLegDistance < distanceSum + link.Link.path.len) {
            return { l: link, linkFraction: remap(coveredLegDistance, distanceSum, distanceSum + link.Link.path.len, 0, 1) };
        }
        distanceSum += link.Link.path.len

    }
    throw new Error("Link not found")
}

export function isActiveAtTime(ride: Ride, time: number): boolean {
    return time >= ride.startTime && time < ride.endTime
}

export function trainPosition(ride: Ride, time: number): Position2d {
    if (!isActiveAtTime(ride, time)) {
        throw new Error("Cannot get position of train outside schedule times");
    }
    
    const currentLeg = findCurrentLeg(ride, time);

    switch (currentLeg.stationary) {
        case true: {
            return {
                position:coordinatesFromLatLng(currentLeg.station.position.latitude,currentLeg.station.position.longitude),
                forward: new Vector2() 
            }
        }
        case false: {
            
            return findCurrentPositionOnLeg(currentLeg, time);

        }
    }
}

export function getStops(legs:Leg[]): Stop[] {
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
