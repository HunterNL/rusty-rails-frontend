import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { API_HOST, StaticData, Station } from "./app";
import { LinkJSON, link, parseLink } from "./rail/link";
import { Ride, RideJSON, Trip, parseRide } from "./rail/ride";
import { newPassageRepo } from "./stoprepo";


export async function findPath(staticData: StaticData, from: string, to: string): Promise<FindPathResponse> {

    const base_url = new URL(API_HOST + "api/find_route");

    const params = new URLSearchParams({
        from,
        to
    });
    let data: FindPathResponseJson = await fetch(base_url + "?" + params.toString()).then(resp => resp.json());

    console.log(data);

    return {
        trips: data.trips,
        rides: data.rides.map(r => parseRide(r, staticData.stationMap, staticData.linkMap))
    };
} export type FindPathResponseJson = {
    trips: Trip[];
    rides: RideJSON[];
};

export type FindPathResponse = {
    trips: Trip[];
    rides: Ride[];
};
export type RemoteData = {
    links: LinkJSON[];
    stations: Station[];
    rides: RideJSON[];
    model: GLTF;
    map_geo: any;
};
// Process and transform data in structures more useful locally
export function parseData(remoteData: RemoteData): StaticData {
    const { model } = remoteData;
    const links = remoteData.links.map(parseLink);

    const stationMap = new Map<string, Station>();
    remoteData.stations.forEach(station => {
        stationMap.set(station.code, station);
    });

    const linkMap = new Map<string, link>();
    links.forEach(l => {
        const key1 = l.from + "_" + l.to;
        const key2 = l.to + "_" + l.from;

        linkMap.set(key1.toLowerCase(), l);
        linkMap.set(key2.toLowerCase(), l);
    });

    const rides = remoteData.rides.map(ride => parseRide(ride, stationMap, linkMap));
    const passages = newPassageRepo(rides);

    return {
        links, rides, stationMap, model, map_geo: remoteData.map_geo, stationPassages: passages, linkMap
    };
}
// Fetch remote data in parallel 
export async function getData(): Promise<RemoteData> {
    const linkspr: Promise<link[]> = fetch(API_HOST + "data/links.json").then(f => f.json()).then(f => f);
    const stationspr: Promise<Station[]> = fetch(API_HOST + "data/stations.json").then(f => f.json()).then(f => f);
    const ridespr: Promise<RideJSON[]> = fetch(API_HOST + "api/activerides").then(f => f.json()).then(f => f);

    // const ridespr: Promise<RideJSON[]> = fetch(API_HOST + "api/rides_all").then(f => f.json()).then(f => f)
    const map_geopr: Promise<object> = fetch("/data/nl_map.json").then(f => f.json());

    const modelLoader = new GLTFLoader();
    const modelpr = modelLoader.loadAsync("/assets/lowpolytrain.glb");

    let [links, stations, rides, model, map_geo] = await Promise.all([linkspr, stationspr, ridespr, modelpr, map_geopr]);

    return { links, stations, rides, model, map_geo };
}

