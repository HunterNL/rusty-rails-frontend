import { ESMap } from "typescript";
import { isStationaryLeg, Ride, Station, StationaryLeg } from "./app";


type PlatformPassages = {
    platform: string,
    passages: StationPassage[]
}

type StationPassage = {
    start: number,
    end: number,
    rideId: number
}

type StationPassages = {
    station: Station
    platforms: PlatformPassages[]
}

type StationPassageRepo = ESMap<string,StationPassages>

function appendLeg(map: StationPassageRepo, leg: StationaryLeg) {
    // Ensure station exists in map
    if (!map.has(leg.station.code)) {
        map.set(leg.station.code, {station:leg.station,platforms:[]})
    }

    const station = map.get(leg.station.code);

    // if (!station.platforms.find(pl => pl.platform == leg.)
}

export function newPassageRepo(rides: Ride[]) : StationPassageRepo {
    const map = new Map();

    // Populate map with every station
    rides.forEach(ride => ride.legs.filter(isStationaryLeg).forEach(leg => appendLeg(map, leg)));

    return map
}

