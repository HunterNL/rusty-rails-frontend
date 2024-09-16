
import { LegLink } from "./leglink";
import { Path, PathJSON, pathFromCoordinateArray } from "./path";



/**
 * A directed path between two stations
 */
export type link = {
    from: string;
    to: string;
    path: Path;
};
export function parseLink(json: LinkJSON, locations: string[]): link {
    const from = locations[json.from];
    const to = locations[json.to];
    return {
        from: from,
        to: to,
        path: pathFromCoordinateArray(json.path.points.map(a => a.coordinates))
    }
}
export function linkLegFromCode(linkMap: Map<string, link>, code: string): LegLink {
    const link = linkMap.get(code)
    if (!link) {
        throw new Error("Link not found")
    }

    const left = code.split("_")[0]
    const reverse = left !== link.from

    return {
        Link: link,
        reversePointOrder: reverse
    }
}

export function findLink(links: link[], a: string, b: string): link {
    return links.find(l => (l.from === a && l.to === b) || (l.from === b && l.to === a))
}
export type LinkJSON = {
    from: string
    to: string
    path: PathJSON
}


