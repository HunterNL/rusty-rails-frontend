/**
 * A stop at a station, specific to a single Ride
 */

export const STOPTYPE = {
    UNKNOWN: 0,
    WAYPOINT: 1,
    SHORT: 2,
    LONG: 3,
    DEPARTURE: 4,
    ARRIVAL: 5,
} as const;


export type Stop = {
    code: string;
    stopType: number;
    ArrivalTime: number;
    DepartureTime: number;
    TripDistance: number;
};
