import { TripRideLeg } from "../../app";
import { Ride, Trip, ride_stopIndexbyCode, ride_stopbyCode } from "../../rail/ride";
import { formatDaySeconds } from "../../time";
import { JSXFactory } from "../tsx";

function waypoints_from_trip(trip: TripRideLeg[]): string[] {
    let out: string[] = [];
    for (let index = 1; index < trip.length; index++) { // NOTE Index = 1
        const leg = trip[index];
        const departureLeg = leg.ride.legs[leg.from];

        out.push(departureLeg.stationary && departureLeg.station.code);
    }
    return out
}

function createTrip(trip: TripRideLeg[]) {
    const waypoints = waypoints_from_trip(trip);
    const firstLeg = trip[0].ride.legs[trip[0].from];
    const departureTime = firstLeg.endTime;

    const lastLeg = trip[trip.length - 1].ride.legs[trip[trip.length - 1].to];
    const arrivalTime = lastLeg.startTime

    return < div class="planner_trip" >
        <div class="planner_trip__time">{formatDaySeconds(departureTime)}</div>
        {waypoints.map(code => <div class="planner_trip__waypoint">{code}</div>)}
        <div class="planner_trip__time">{formatDaySeconds(arrivalTime)}</div>
        {/* {
            trip.legs.map(leg => {
                return <div class="planner_trip__leg">{leg.from} - {leg.to}</div>
            })
        } */}
    </div >
}

export function createTrips(trips: TripRideLeg[][]): HTMLElement {
    return <div class="planner_trip_list">{trips.map(createTrip)}</div>


}