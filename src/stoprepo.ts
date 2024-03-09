import { ESMap } from "typescript";
import { isStationaryLeg, Ride, RideIdJSON, Station, StationaryLeg } from "./app";


export type PlatformPassages = {
    platform: string,
    passages: StationPassage[]
}

export type StationPassage = {
    start: number,
    end: number,
    rideId: RideIdJSON[]
}

export type StationPassages = {
    station: Station
    platforms: PlatformPassages[]
}

export type StationPassageRepo = ESMap<string,StationPassages>

function appendLeg(map: StationPassageRepo, leg: StationaryLeg) {
    // Ensure station exists in map
    if (!map.has(leg.station.code)) {
        map.set(leg.station.code, {station:leg.station,platforms:[]})
    }

    const stationPassages = map.get(leg.station.code);

    if(leg.platforms == null) {
        return
    }

    if (!stationPassages.platforms.find(pl => pl.platform == leg.platforms.arrival_platform)) {
        stationPassages.platforms.push({platform:leg.platforms.arrival_platform,passages:[]})
    }

    let passages = stationPassages.platforms.find(pl => pl.platform == leg.platforms.arrival_platform).passages;

    passages.push({start:leg.startTime,end:leg.endTime,rideId:leg.rideId}) //TODO Filter to rideId for this stop specifically
}

export function newPassageRepo(rides: Ride[]) : StationPassageRepo {
    const map = new Map();

    // Populate map with every station
    rides.forEach(ride => ride.legs.filter(isStationaryLeg).forEach(leg => appendLeg(map, leg)));

    return map
}


