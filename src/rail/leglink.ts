import { TrackPosition } from "../app";
import { link } from "./link";
import { PathPoint } from "./path";



/**
 * A directed path between two stations, with the ability to easily read in the right order
 */
export type LegLink = {
    Link: link;
    reversePointOrder: boolean;
};

// export function legLinkFindOnPath(link:LegLink,  {
//     let pathLength = link.Link.path.points.length;
//     for (let highIndex = 1; highIndex < pathLength; highIndex++) { // Note index starting at one
//         const highIndex = link.Link.path[highIndex];
//         const lowElem

//     }
// }

export function LegLinkFirstStation(link: LegLink): string {
    if (link.reversePointOrder) {
        return link.Link.to
    } else {
        return link.Link.from;
    }
}

export function LegLinkLastStation(link: LegLink): string {
    if (link.reversePointOrder) {
        return link.Link.from
    } else {
        return link.Link.to;
    }
}

export function firstPosition(link: LegLink): TrackPosition {
    if (!link.reversePointOrder) {
        return {
            leglink: link,
            offset: link.Link.path.pathLength - link.Link.path.points[0].start_offset
        };
    } else {
        return {
            leglink: link,
            offset: link.Link.path.pathLength
        }
    }
}

export function lastPosition(link: LegLink): TrackPosition {
    if (!link.reversePointOrder) {
        return {
            leglink: link,
            offset: link.Link.path.pathLength - link.Link.path.points[0].start_offset
        };
    } else {
        return {
            leglink: link,
            offset: link.Link.path.pathLength
        }
    }
}

// export function lastPosition(link)


export function firstPoint(link: LegLink): PathPoint {
    let path = link.Link.path;
    let pathLen = path.pathLength;

    if (link.reversePointOrder) {
        return path[path.points.length - 1];
    } else {
        return path.points[0]
    }
}

export function lastPoint(link: LegLink): PathPoint {
    let path = link.Link.path;

    if (link.reversePointOrder) {
        return path.points[0]
    } else {
        return path[path.points.length - 1];
    }
}

export function legLink_Iter(link: LegLink, fn: (p: PathPoint) => any): void {
    if (link.reversePointOrder) {
        for (let index = link.Link.path.points.length - 1; index >= 0; index--) {
            fn(link.Link.path.points[index]);
        }
    } else {
        // eslint-disable-next-line prefer-for-of more obivous this is just the above in reverse this way
        for (let index = 0; index < link.Link.path.points.length; index++) {
            fn(link.Link.path.points[index]);
        }
    }
}

export function legLink_IterWithDistance(link: LegLink, fn: (p: PathPoint, distanceTraveled: number) => any): void {
    if (link.reversePointOrder) {
        for (let index = link.Link.path.points.length - 1; index >= 0; index--) {
            const point = link.Link.path.points[index];
            fn(point, link.Link.path.pathLength - point.start_offset);
        }
    } else {
        // eslint-disable-next-line prefer-for-of more obivous this is just the above in reverse this way
        for (let index = 0; index < link.Link.path.points.length; index++) {
            const point = link.Link.path.points[index];
            fn(point, point.start_offset);
        }
    }
}

