import { Trip } from "../../rail/ride";
import { JSXFactory } from "../tsx";

function createTrip(trip: Trip) {
    return <div class="planner_trip">
        {trip.legs.map(leg => {
            return <div class="planner_trip__leg">{leg.from} - {leg.to}</div>
        })}
    </div>
}

export function createTrips(trips: Trip[]): HTMLElement {
    return <div class="planner_trip_list">{trips.map(createTrip)}</div>


}