import { PlatformJSON, StaticData, Station } from "../app";
import { Ride } from "../ride";
import { inverseLerp } from "../number";
import { Stop, STOPTYPE } from "../stop";
import { StationPassage, StationPassages } from "../stoprepo";
import { formatDaySeconds, fromSeconds } from "../time";
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
    if (!platform) return ""

    if (platform.arrival_platform == platform.departure_platform) {
        return platform.arrival_platform
    } else {
        return platform.arrival_platform + "->" + platform.departure_platform
    }
}

export function createRideSideBar(ride: Ride, data: StaticData): Element {
    const stops = ride.stops
    const stations = data.stationMap

    // debugger

    const elem = <div class="sidebar_ride">
        <div class="id">{ride.id.toString()}</div>
        {stops.map(stop =>
            <div class="stop">
                <div class="name">{stations.get(stop.code).name}</div>
                <div class="time">{stopDisplayTime(stop)}</div>
                <div class="platform">{stopDisplayplatform(stop.platform)}</div>
            </div>)}
    </div>
    return elem;
}

export function createStationSidebar(station: Station): Element {
    return <div class="sidebar_station">
        <div class="station">
            <div class="name">{station.name}</div>
        </div>
    </div>
}

function calcPassageStyle(passage: StationPassage, startTime: number, endTime: number): Partial<CSSStyleDeclaration> {
    let offset = inverseLerp(startTime, endTime, passage.start);


    // TODO Filter out earlier
    if (offset < 0 || offset > 1) {
        return {
            display: "none"
        }
    }

    return {
        left: (offset * 100) + "%",
        top: "0px"
    }
}


export function renderStationPassages(passages: StationPassages, startTime: number, endTime: number): Element {
    return <div class="station_passages">
        <div class="station_name">{passages.station.name}</div>
        <div class="station_platforms">
            {passages.platforms.map(platform => {
                return <div class="station_platform">
                    <div class="platform_name">{platform.platform}</div>
                    <div class="platform_timeline">
                        {platform.passages.map(passage => {
                            return <div class="timeline_item" style={calcPassageStyle(passage, startTime, endTime)}>
                                {passage.id}
                            </div>
                        })}
                    </div>

                </div>
            })}
        </div>
    </div>
}
