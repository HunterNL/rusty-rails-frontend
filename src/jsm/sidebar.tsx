import { Ride, StaticData } from "../app";
import { Stop, STOPTYPE } from "../stop";
import { formatDaySeconds } from "../time";
import { JSXFactory } from "../tsx"

function stopDisplayTime(stop: Stop): string {
    switch (stop.stopType) {
        case STOPTYPE.ARRIVAL:
            return formatDaySeconds(stop.ArrivalTime);
        case STOPTYPE.WAYPOINT:
            return "";
        case STOPTYPE.UNKNOWN:
            throw new Error("Unexpected stoptype");
        default:
            return formatDaySeconds(stop.DepartureTime);
    }
}

export function createSideBar(ride: Ride, data: StaticData): Element {
    const stops = ride.stops
    const stations = data.stationMap

    const elem = <div class="sidebar_ride">
        {ride.ride_ids.map(id => { return <div class="id">{id.number.toString()}</div> })}
        {stops.map(stop =>
            <div class="stop">
                <div class="name">{stations.get(stop.code).name}</div>
                <div class="time">{stopDisplayTime(stop)}</div>
            </div>)}
    </div>
    return elem;
}