import { Vec2, Vector2, Vector3 } from "three";
import { Leg, LegLink, MovingLeg, Ride } from "./app";
import { remap } from "./util";


type Position2d = {
    position: Vec2
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

            const v1 = new Vector2(leftPoint.coordinates.lat, leftPoint.coordinates.lon);
            const v2 = new Vector2(rightPoint.coordinates.lat, rightPoint.coordinates.lon);
            const position = v1.lerp(v2, pointFraction);

            const forward = v2.clone().sub(v1).normalize()
            if (!l.reversePointOrder) {
                forward.multiplyScalar(-1);
            }

            return {
                position,
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

export function trainPosition(ride: Ride, time: number): { pos: THREE.Vector2; rot: THREE.Vector3; } {
    if (!isActiveAtTime(ride, time)) {
        throw new Error("Cannot get position of train outside schedule times");
    }
    
    const currentLeg = findCurrentLeg(ride, time);

    switch (currentLeg.stationary) {
        case true: {
            
            const pos = new Vector2(currentLeg.station.position.lat, currentLeg.station.position.lon);
            const rot = new Vector3();
            // console.log(pos,rot)

            return { pos, rot }
        }
        case false: {
            // return {pos: new Vector2,rot: new Vector3}
            const pos2d = findCurrentPositionOnLeg(currentLeg, time);

            const rot = new Vector3(pos2d.forward.x, 0, pos2d.forward.y);

            return {
                pos: new Vector2(pos2d.position.x, pos2d.position.y),
                rot
            }
        }
    }
}
