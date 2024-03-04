import { PlatformJSON, Ride, StaticData } from "../app";
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

function stopDisplayplatform(platform: PlatformJSON): string {
    if(!platform) return ""
    console.log(platform)
    if(platform.arrival_platform == platform.departure_platform) {
        return platform.arrival_platform
    } else {
        return platform.arrival_platform + "->" + platform.departure_platform
    }
}

export function createSideBar(ride: Ride, data: StaticData): Element {
    const stops = ride.stops
    const stations = data.stationMap

    // debugger

    const elem = <div class="sidebar_ride">
        {ride.ride_ids.map(id => { return <div class="id">{id.number.toString()}</div> })}
        {stops.map(stop =>
            <div class="stop">
                <div class="name">{stations.get(stop.code).name}</div>
                <div class="time">{stopDisplayTime(stop)}</div>
                <div class="platform">{stopDisplayplatform(stop.platform)}</div>
            </div>)}
    </div>
    return elem;
}