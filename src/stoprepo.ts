import { ESMap } from "typescript";
import { isStationaryLeg, Ride, RideIdJSON, Station, StationaryLeg } from "./app";
import { isDigit } from "./number";


export type PlatformPassages = {
    platform: string,
    passages: StationPassage[]
}

export type StationPassage = {
    start: number,
    end: number,
    id: string
}

export type StationPassages = {
    station: Station
    platforms: PlatformPassages[]
}

export type StationPassageRepo = Map<string,StationPassages>

function getInitialDigitsAsNumber(s: string): number {
    let out = "";
    for (let char of s) {
        if(isDigit(char)) {
            out = out + char
        }
    }

    if(out.length == 0) {
        throw new Error("Expected numbers")
    }

    return parseInt(out,10);
}

function trimPlatformToNumber(a:string): number {
    // Botch to handle "n-n"
    // if(a[1] == "-") {
    //     return parseInt(a[0],10);
    // }

    return getInitialDigitsAsNumber(a)
}

function platformOrder(a:string,b:string): number {
    const aNum = trimPlatformToNumber(a)
    const bNum = trimPlatformToNumber(b)

    if(aNum == bNum) {
        const aSuffix = a[a.length-1]
        const bSuffix = b[b.length-1]

        return aSuffix.charCodeAt(0) - bSuffix.charCodeAt(0);
    }


    return aNum - bNum
}

function appendLeg(map: StationPassageRepo, leg: StationaryLeg,id: string) {
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

    passages.push({start:leg.startTime,end:leg.endTime,id}) //TODO Filter to rideId for this stop specifically
}

export function newPassageRepo(rides: Ride[]) : StationPassageRepo {
    const map: StationPassageRepo = new Map();

    // Populate map with every station
    rides.forEach(ride => ride.legs.filter(isStationaryLeg).forEach(leg => appendLeg(map, leg,ride.id.toString())));

    for (let station of map.values()) {
        station.platforms.sort((p1,p2) => platformOrder(p1.platform,p2.platform))
    }

    return map
}


