/**
 * A stop at a station, specific to a single Ride
 */

import { PlatformJSON } from "../app";

export const STOPTYPE = {
    UNKNOWN: 0,
    WAYPOINT: 1,
    SHORT: 2,
    LONG: 3,
    DEPARTURE: 4,
    ARRIVAL: 5,
} as const;


export function StopTypeFromObjKey(obj: any) {
    if ("Departure" in obj) {
        return STOPTYPE.DEPARTURE
    }

    if ("StopShort" in obj) {
        return STOPTYPE.SHORT
    }

    if ("StopLong" in obj) {
        return STOPTYPE.LONG
    }

    if ("Arrival" in obj) {
        return STOPTYPE.ARRIVAL
    }

    throw new Error("Unknown stoptype:" + JSON.stringify(Object.keys(obj)))
}

export type Stop = {
    code: string;
    stopType: number;
    ArrivalTime: number;
    DepartureTime: number;
    TripDistance: number;
    platform: PlatformJSON | null
};
