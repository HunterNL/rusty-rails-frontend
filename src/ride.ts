import { Vector2 } from "three";
import { PlatformJSON, Station, TrackPosition } from "./app";
import { LegLink, firstPosition, lastPosition } from "./leglink";
import { link, linkLegFromCode } from "./link";
import { path_findOffsetPosition } from "./path";
import { Stop } from "./stop";
import { Coordinates, coordinatesFromLatLng, joinWith, remap } from "./util";


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
    for (const link of leg.links) {

        if (coveredLegDistance >= distanceSum && coveredLegDistance <= distanceSum + link.Link.path.pathLength) {
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

    if (lastLeg !== undefined) {
        return lastPosition(lastLeg.links[lastLeg.links.length - 1]);
    }
    if (nextLeg !== undefined) {
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
export type RideJSON = {
    id: number;
    startTime: number;
    endTime: number;
    distance: number;
    dayValidity: number;
    legs: LegJSON[];
};

export type RideIdJSON = {
    "company_id": number;
    "ride_id": number | null;
    "line_id": number | null;
    "first_stop": number;
    "last_stop": number;
    "ride_name": null;
}; export type trip = {
    legs: TripLeg[];
};

export type TripLeg = {
    from: string;
    to: string;
    id: string;
};
/**
 *  A segment between or at stops, specific to a single Ride
 */
// export type LegJSON = {
//     start: number,
//     end: number,
// } & ({
//     Stationary: string,
//     Stoptype: number
// }|{
//     Moving: [string,string,string[]]
// })


export type LegJSON = {
    "timeStart": number;
    "timeEnd": number;
    "moving": boolean;
    "waypoints": string[] | null;
    "from": string | null;
    "to": string | null;
    "stationCode": string | null;
    "platform": PlatformJSON | null;
    "stopType": number | null;

};

export type Leg = StationaryLeg | MovingLeg;

export function isStationaryLeg(l: Leg): l is StationaryLeg {
    return l.stationary;
}

export function isMovingLeg(l: Leg): l is MovingLeg {
    return !l.stationary;
}

export type StationaryLeg = {
    endTime: number;
    startTime: number;
    stationary: true;
    station: Station;
    stopType: number;
    platforms: PlatformJSON;
};

export type MovingLeg = {
    endTime: number;
    startTime: number;
    stationary: false;
    from: string;
    to: string;
    links: LegLink[];
    link_codes: string[];
    link_distance: number;
};
export type Ride = {
    id: number;
    distance: number;
    stops: Stop[];
    startTime: number;
    endTime: number;
    legs: Leg[];
};

export type RideId = {
    number: number;
    name: string;
    from: number;
    to: number;
};
export function parseLeg(json: LegJSON, index: number, rideJson: RideJSON, stations: Map<string, Station>, links: Map<string, link>): Leg {
    if (json.moving) {
        const link_codes = create_link_codes(json.from, json.to, json.waypoints)
        const links2 = link_codes.map(code => linkLegFromCode(links, code))
        const link_distance = links2.reduce((acc, cur) => acc + cur.Link.path.pathLength, 0)

        return {
            endTime: json.timeEnd,
            startTime: json.timeStart,
            from: json.from,
            to: json.to,
            stationary: false,
            link_codes,
            links: links2,
            link_distance,
        }


    } else {
        return {
            endTime: json.timeEnd,
            startTime: json.timeStart,
            station: stations.get(json.stationCode),
            stationary: true,
            stopType: json.stopType,
            platforms: json.platform,
        }

    }
}
export function create_link_codes(start: string, end: string, waypoints: string[]): string[] {
    let codes = [start, ...waypoints, end]
    return joinWith(codes, (left, right) => {
        return left + "_" + right
    })
}
export function parseRide(rideJson: RideJSON, stations: Map<string, Station>, links: Map<string, link>): Ride {
    let legs = rideJson.legs.map((legJson, index) => parseLeg(legJson, index, rideJson, stations, links))


    return {
        id: rideJson.id,
        distance: rideJson.distance,
        endTime: rideJson.endTime,
        startTime: rideJson.startTime,
        stops: getStops(legs),
        legs,
    }
}
// export function findCurrentLink(ride: Ride, rideProgress: number): [Stop, Stop, number] {
//     const drivenDistance = ride.distance * rideProgress
//     if (rideProgress == 1) {
//         const len = ride.stops.length
//         return [ride.stops[len - 1], ride.stops[len - 2], 0]
//     }

//     for (let index = 0; index < ride.stops.length; index++) {
//         const stop = ride.stops[index]
//         if (stop.TripDistance > drivenDistance) {
//             const remainingDistance = stop.TripDistance - drivenDistance
//             return [ride.stops[index - 1], ride.stops[index], remainingDistance]
//         }

//     }
//     throw new Error("Stop not found")
// }

