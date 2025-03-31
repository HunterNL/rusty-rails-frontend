import { PlatformJSON, StaticData, Station } from "../../app";
import { Ride } from "../../rail/ride";
import { inverseLerp } from "../../number";
import { Stop, STOPTYPE } from "../../rail/stop";
import { StationPassage, StationPassages } from "../../stoprepo";
import { formatDaySeconds } from "../../time";
import { JSXFactory } from "../tsx";

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

    if (platform.arrival_platform === platform.departure_platform) {
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
        <div class="speed">{Math.round(ride.speed * 3.6).toString()} km/h</div>
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
    let startPosition = inverseLerp(startTime, endTime, passage.start);
    let endFraction = inverseLerp(startTime, endTime, passage.end)


    // TODO Filter out earlier
    if (startPosition < 0 || startPosition > 1) {
        return {
            display: "none"
        }
    }

    return {
        left: (startPosition * 100) + "%",
        right: 100 - (endFraction * 100) + "%",
        top: "0px"
    }
}

const kindMap = ["unknown", "timeline_waypoint", "timeline_short", "timeline_long", "timeline_departure", "timeline_arrival"]

function calcPassageClass(passage: StationPassage) {
    let a = "timeline_item"
    a = a + " " + kindMap[passage.kind]
    return a
}


export function renderStationPassages(passages: StationPassages, startTime: number, endTime: number): Element {
    return <div class="station_passages">
        <div class="station_name">{passages.station.name}</div>
        <div class="station_platforms">
            {passages.platforms.map(platform => {
                return <div class="station_platform">
                    <div class="platform_label_spacer"></div>
                    <div class="platform_name">{platform.platform}</div>
                    <div class="platform_timeline">
                        {platform.passages.map(passage => {
                            return <div className={calcPassageClass(passage)} style={calcPassageStyle(passage, startTime, endTime)}>
                                <div class="timeline_label">{passage.id}</div>
                            </div>
                        })}
                    </div>

                </div>
            })}
        </div>
    </div>
}
