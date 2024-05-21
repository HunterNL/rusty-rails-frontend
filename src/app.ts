
import { BufferGeometry, FrontSide, InstancedMesh, Matrix4, MeshBasicMaterial, NearestFilter, sRGBEncoding, Texture, Vector3, Vector2, SRGBColorSpace } from "three"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TrainMap, createTimelineSingle } from "./jsm/map"
import { Sidebar } from "./sidebar"
import { Coordinates, greatCircleDistanceCoords, joinWith, onDomReady } from "./util"
import { createRideSideBar, createStationSidebar, renderStationPassages } from "./jsm/sidebar"
import { getStops, isActiveAtTime, Position2d, realPosition, trainPosition } from "./ride"
import { asSeconds, currentDayOffset, fromSeconds } from "./time"
import { Stop } from "./stop"
import { newPassageRepo, StationPassageRepo } from "./stoprepo"
import { mercator } from "./geo";
import { link } from "./link"
import { LegLink } from "./leglink"
import { inverseLerp, lerp } from "./number"

const TRAIN_UPDATE_INTERVAL_MS = 500
const TRACK_SIDEWAYS_OFFSET = 2.5
const TRAIN_SCALE = 0.0017;

const API_HOST = "https://api.dev.localhost/"



export type RideJSON = {
    id: number
    startTime: number,
    endTime: number
    distance: number
    dayValidity: number
    legs: LegJSON[]
}

export type RideIdJSON = {
    "company_id": number,
    "ride_id": number | null,
    "line_id": number | null,
    "first_stop": number,
    "last_stop": number,
    "ride_name": null
}

export type trip = {
    legs: TripLeg[]
}

export type TripLeg = {
    from: string,
    to: string,
    id: string
}

export type FindPathResponseJson = {
    trips: trip[],
    rides: RideJSON[]
}

export type FindPathResponse = {
    trips: trip[],
    rides: Ride[]
}

export async function findPath(staticData: StaticData, from: string, to: string): Promise<FindPathResponse> {

    const base_url = new URL(API_HOST + "api/find_route");

    const params = new URLSearchParams({
        from,
        to
    })
    let data: FindPathResponseJson = await fetch(base_url + "?" + params.toString()).then(resp => resp.json());

    console.log(data)

    return {
        trips: data.trips,
        rides: data.rides.map(r => parseRide(r, staticData.stationMap, staticData.linkMap))
    }
}

function parseRide(rideJson: RideJSON, stations: Map<string, Station>, links: Map<string, link>): Ride {
    let legs = rideJson.legs.map((legJson, index) => parseLeg(legJson, index, rideJson, stations, links))


    return {
        id: rideJson.id,
        distance: rideJson.distance,
        endTime: rideJson.endTime,
        startTime: rideJson.startTime,
        stops: getStops(legs),
        legs,
    }
}

function create_link_codes(start: string, end: string, waypoints: string[]): string[] {
    let codes = [start, ...waypoints, end];
    return joinWith(codes, (left, right) => {
        return left + "_" + right
    })
}


function parseLeg(json: LegJSON, index: number, rideJson: RideJSON, stations: Map<string, Station>, links: Map<string, link>): Leg {
    if (json.moving) {
        const link_codes = create_link_codes(json.from, json.to, json.waypoints);
        const links2 = link_codes.map(code => linkLegFromCode(links, code));
        const link_distance = links2.reduce((acc, cur) => acc + cur.Link.path.pathLength, 0)

        return {
            endTime: json.timeEnd,
            startTime: json.timeStart,
            from: json.from,
            to: json.to,
            stationary: false,
            link_codes,
            links: links2,
            link_distance,
        }


    } else {
        return {
            endTime: json.timeEnd,
            startTime: json.timeStart,
            station: stations.get(json.stationCode),
            stationary: true,
            stopType: json.stopType,
            platforms: json.platform,
        }

    }
}

export type PlatformJSON = {
    arrival_platform: string,
    departure_platform: string
    footnote: number // Unused clientside
}


/**
 *  A segment between or at stops, specific to a single Ride  
 */
// export type LegJSON = {
//     start: number,
//     end: number,
// } & ({
//     Stationary: string,
//     Stoptype: number
// }|{
//     Moving: [string,string,string[]]
// })

export type LegJSON = {
    "timeStart": number
    "timeEnd": number
    "moving": boolean
    "waypoints": string[] | null
    "from": string | null
    "to": string | null
    "stationCode": string | null
    "platform": PlatformJSON | null
    "stopType": number | null

}

export type Leg = StationaryLeg | MovingLeg

export function isStationaryLeg(l: Leg): l is StationaryLeg {
    return l.stationary
}

export function isMovingLeg(l: Leg): l is MovingLeg {
    return !l.stationary
}

export type StationaryLeg = {
    endTime: number;
    startTime: number;
    stationary: true;
    station: Station;
    stopType: number;
    platforms: PlatformJSON;
}

export type MovingLeg = {
    endTime: number;
    startTime: number;
    stationary: false;
    from: string;
    to: string
    links: LegLink[]
    link_codes: string[];
    link_distance: number
    // isReversing: boolean /** If the train is progessing against the order in the related link's points */
}

export type TrackPosition = {
    leglink: LegLink // The leglink this position is located in
    offset: number   // Offset from the start of the link
}

export type Ride = {
    id: number
    distance: number
    stops: Stop[],
    startTime: number
    endTime: number
    legs: Leg[]
}

export type RideId = {
    number: number,
    name: string,
    from: number,
    to: number
}

export type PathPoint = {
    coordinates: Coordinates,
    start_offset: number,
}

export type Path = {
    points: PathPoint[],
    pathLength: number,
}
/**
 * Find the element before and after the given offset
 */
export function path_findOffsetSpan(path: PathPoint[], offset: number): [PathPoint, PathPoint] {
    for (let index = 0; index < path.length - 1; index++) { // Note length-1
        const lowElement = path[index];
        const highElement = path[index + 1];

        // Note, inclusive on both ends
        if (offset >= lowElement.start_offset && offset <= highElement.start_offset) {
            return [lowElement, highElement]
        }
    }

    // Span must be found, if not the offset or path is invalid
    throw new Error("span not found")
}

export function path_findOffsetPosition(path: PathPoint[], offset: number): Position2d {
    const [lowElement, highElement] = path_findOffsetSpan(path, offset);

    let fraction = inverseLerp(lowElement.start_offset, highElement.start_offset, offset)

    let latitude = lerp(lowElement.coordinates.latitude, highElement.coordinates.latitude, fraction)
    let longitude = lerp(lowElement.coordinates.longitude, highElement.coordinates.longitude, fraction)

    let from = new Vector2(lowElement.coordinates.latitude, lowElement.coordinates.longitude);
    let to = new Vector2(highElement.coordinates.latitude, highElement.coordinates.longitude);

    from.sub(to).normalize();

    return {
        position: { latitude, longitude },
        forward: from
    }
}

export type PathJSON = { points: { coordinates: Coordinates }[] }

export type LinkJSON = {
    from: string
    to: string
    path: PathJSON
}

export type Station = {
    code: string,
    name: string,
    position: Coordinates

}

const MAP_SCALE = 90;

export function projectCoordsToMap(coords: Coordinates): [number, number] {
    const [x, y] = mercator(coords.latitude, coords.longitude);
    return [x * MAP_SCALE, y * MAP_SCALE]
}

export function projectCoordsToMapVec3(coords: Coordinates): Vector3 {

    const [x, y] = mercator(coords.latitude, coords.longitude);
    return new Vector3(x, 0, y).multiplyScalar(MAP_SCALE)
}

export function vec3FromCoords(coords: Coordinates): Vector3 {
    return new Vector3(coords.latitude, 0, coords.longitude);
}

// Take an array of links, return an array of vector3's ready for a geometrybuffer
// We're using linesegments so every line gets it own two vertices
// While links.points is just a an array of points this function turns that into an array of segments with duplicate vertices
// Alternatives are ditching the whole one-buffer setup and having seperate objects, or using indices
export function wpToArray(links: link[]): Vector3[] {
    const a = links.map(wp => {
        return joinWith(wp.path.points, (left, right) => {
            return [projectCoordsToMapVec3(left.coordinates), projectCoordsToMapVec3(right.coordinates)]
        })
    })

    return a.flat(2);
}

export function findLink(links: link[], a: string, b: string): link {
    return links.find(l => (l.from == a && l.to == b) || (l.from == b && l.to == a))
}

export type RemoteData = {
    links: LinkJSON[]
    stations: Station[]
    rides: RideJSON[]
    model: any
    map_geo: any
}

export type StaticData = {
    links: link[]
    rides: Ride[]
    stationMap: Map<string, Station>
    linkMap: Map<string, link>,
    model: any
    map_geo: any,
    stationPassages: StationPassageRepo
}

function linkLegFromCode(linkMap: Map<string, link>, code: string): LegLink {
    const link = linkMap.get(code);
    if (!link) {
        throw new Error("Link not found");
    }

    const left = code.split("_")[0];
    const reverse = left != link.from;

    return {
        Link: link,
        reversePointOrder: reverse
    }
}

function pathFromCoordinateArray(coords: Coordinates[]): Path {
    // console.log("IN")
    // console.log(coords,coords.length);
    if (coords.length < 2) {
        throw new Error("Expected path to have at least 2 elements");
    }

    const out: Path["points"] = [{ start_offset: 0, coordinates: coords[0] }]

    let sum = 0;
    // Note index = 1!
    for (let index = 1; index < coords.length; index++) {
        const lastElement = coords[index - 1];
        const element = coords[index];

        sum += greatCircleDistanceCoords(lastElement, element)
        out.push({ coordinates: element, start_offset: sum })
    }

    return {
        pathLength: sum,
        points: out
    }
}

function parseLink(json: LinkJSON): link {
    return {
        from: json.from,
        to: json.to,
        path: pathFromCoordinateArray(json.path.points.map(a => a.coordinates))
    }
}

// Process and transform data in structures more useful locally
function parseData(remoteData: RemoteData): StaticData {
    const { model } = remoteData;
    const links = remoteData.links.map(parseLink)

    const stationMap = new Map<string, Station>();
    remoteData.stations.forEach(station => {
        stationMap.set(station.code, station)
    })

    const linkMap = new Map<string, link>()
    links.forEach(l => {
        const key1 = l.from + "_" + l.to;
        const key2 = l.to + "_" + l.from;

        linkMap.set(key1.toLowerCase(), l)
        linkMap.set(key2.toLowerCase(), l)
    })

    const rides = remoteData.rides.map(ride => parseRide(ride, stationMap, linkMap))

    // rides.forEach(ride => {
    //     ride.legs.forEach(leg => {
    //         if ("Stationary" in leg) {
    //             const station = stationMap.get(leg.Stationary);
    //             if (!station) {
    //                 throw new Error("Expected a station")
    //             }
    //             leg.Stationary.station = station;
    //             return;
    //         } 
    //         if("Moving" in leg) {
    //             leg.Moving.links = leg.Moving.link_codes.map(code => linkLegFromCode(linkMap, code));
    //         }



    //     })
    // })

    const passages = newPassageRepo(rides)



    return {
        links, rides, stationMap, model, map_geo: remoteData.map_geo, stationPassages: passages, linkMap
    }
}

// Fetch remote data in parallel 
async function getData(): Promise<RemoteData> {
    const linkspr: Promise<link[]> = fetch(API_HOST + "data/links.json").then(f => f.json()).then(f => f)
    const stationspr: Promise<Station[]> = fetch(API_HOST + "data/stations.json").then(f => f.json()).then(f => f)
    const ridespr: Promise<RideJSON[]> = fetch(API_HOST + "api/activerides").then(f => f.json()).then(f => f)

    // const ridespr: Promise<RideJSON[]> = fetch(API_HOST + "api/rides_all").then(f => f.json()).then(f => f)

    const map_geopr: Promise<object> = fetch("/data/nl_map.json").then(f => f.json())

    const modelLoader = new GLTFLoader()
    const modelpr = modelLoader.loadAsync("/assets/lowpolytrain.glb")

    let [links, stations, rides, model, map_geo] = await Promise.all([linkspr, stationspr, ridespr, modelpr, map_geopr])

    return { links, stations, rides, model, map_geo }
}

onDomReady(() => {
    setupHotReload()

    const sidebar = new Sidebar(document.getElementById("sidebar"))
    document.querySelectorAll("[data-action='sidebar_close']").forEach(e => e.addEventListener("click", () => sidebar.hide()))

    window.addEventListener("keydown", e => {
        if (e.key == "Escape") {
            sidebar.hide()
        }
    })
    setupMap(sidebar).then(({ map, data }) => {
        setupForm(data, form, trip_list, map);
    }).catch(e => console.error(e))

    const form = document.getElementById("plan_form");
    const trip_list = document.getElementById("trip_list");
})



function setupHotReload() {
    new EventSource('/esbuild').addEventListener('change', () => location.reload())
}

function updateRides(mesh: THREE.InstancedMesh, data: StaticData, instanceIndexToRideMap: Map<number, Ride>, currentTime: number): void {
    const { rides, links } = data

    let count = 0;

    for (let index = 0; index < rides.length; index++) {

        const ride = rides[index];
        instanceIndexToRideMap.set(index, ride)

        if (!isActiveAtTime(ride, currentTime)) {
            continue
        }

        const tp = trainPosition(ride, currentTime);
        const pos = realPosition(tp);

        const up = new Vector3(0, 1, 0);
        const trainPos = projectCoordsToMapVec3(pos.position)
        const rot = new Vector3(pos.forward.x, 0, pos.forward.y)

        // Offset to the right of travel direction
        const right = new Vector3().crossVectors(rot, up)

        trainPos.addScaledVector(right, -TRAIN_SCALE * TRACK_SIDEWAYS_OFFSET)

        const mat4 = new Matrix4()
        mat4.lookAt(new Vector3, rot, new Vector3(0, 1, 0))
        mat4.setPosition(trainPos)

        mesh.setMatrixAt(index, mat4)
        count++
    }
    mesh.instanceMatrix.needsUpdate = true

}

export function placeRides(data: StaticData, dataMap: Map<number, Ride>): THREE.InstancedMesh {
    const { rides } = data

    const model = data.model
    const trainGeo = new BufferGeometry()
    const trainMat = new MeshBasicMaterial()

    const trainTexture = new Texture()
    trainTexture.copy(model.scenes[0].children[0].material.map)

    trainGeo.copy(model.scenes[0].children[0].geometry) // Whyyyyyy
    trainMat.copy(model.scenes[0].children[0].material)
    trainMat.map.magFilter = NearestFilter
    trainMat.side = FrontSide
    trainMat.map = trainTexture


    trainMat.map.colorSpace = SRGBColorSpace
    trainGeo.scale(TRAIN_SCALE, TRAIN_SCALE, TRAIN_SCALE)

    const mesh = new InstancedMesh(trainGeo, trainMat, rides.length)


    updateRides(mesh, data, dataMap, currentDayOffset())

    window.setInterval((dt) => {
        const currentTime = currentDayOffset()
        updateRides(mesh, data, dataMap, currentTime)
    }, TRAIN_UPDATE_INTERVAL_MS)


    return mesh
}

async function setupMap(sidebar: Sidebar): Promise<{ map: TrainMap, data: StaticData }> {
    const data = parseData(await getData())
    const container = document.getElementById("mapcontainer")

    if (!container) {
        throw new Error("No container")
    }

    const trainMap = new TrainMap(data, document, container)
    trainMap.startLoop()

    trainMap.onTrainClick = (ride) => {
        sidebar.reveal("side")
        sidebar.renderIntoChild("instanceid", createRideSideBar(ride, trainMap.staticData))
    }

    trainMap.onStationClick = (station: Station) => {
        sidebar.reveal("large");

        let passages = trainMap.staticData.stationPassages.get(station.code);
        let now = currentDayOffset();
        let end = now + fromSeconds(3600 * 2)

        if (passages) {
            sidebar.renderIntoChild("instanceid", renderStationPassages(passages, currentDayOffset(), end))
        } else {
            sidebar.renderIntoChild("instanceid", createStationSidebar(station))
        }

    }

    return { map: trainMap, data: data }
}


export function findCurrentLink(ride: Ride, rideProgress: number): [Stop, Stop, number] {
    const drivenDistance = ride.distance * rideProgress
    if (rideProgress == 1) {
        const len = ride.stops.length
        return [ride.stops[len - 1], ride.stops[len - 2], 0]
    }

    for (let index = 0; index < ride.stops.length; index++) {
        const stop = ride.stops[index];
        if (stop.TripDistance > drivenDistance) {
            const remainingDistance = stop.TripDistance - drivenDistance
            return [ride.stops[index - 1], ride.stops[index], remainingDistance]
        }

    }
    throw new Error("Stop not found")
}


function originIsolationCheck() {
    if (!crossOriginIsolated) {
        console.warn("Page is not origin isolated, performance.now() will be less accurate")
    }
}

originIsolationCheck()

function harvestElement(elem: HTMLElement): any {
    return (elem as any).value;
}

function harvest(form: HTMLElement): Record<string, any> {
    const out = {};
    form.querySelectorAll("[data-field]").forEach(e => {
        const key = (e as HTMLElement).dataset.field;
        const value = harvestElement(e as HTMLElement);

        out[key] = value;
    })
    return out
}

function setupForm(staticData: StaticData, form: HTMLElement, outputElem: HTMLElement, map: TrainMap) {
    form.addEventListener("submit", e => {
        e.preventDefault()
        let formdata = harvest(form)
        map.mapContent.plan_options.children.forEach(c => c.removeFromParent())

        findPath(staticData, formdata.from, formdata.to).then(res => {
            const now = currentDayOffset();

            res.trips.flatMap(trip => trip.legs).map(leg => {
                leg.from = leg.from.toLowerCase()
                leg.to = leg.to.toLowerCase()
            })

            res.trips.flatMap(trip => trip.legs).map(leg => {
                let ride = res.rides.find(ride => ride.id.toString() == leg.id)
                if (!ride) {
                    console.groupCollapsed("Ride " + leg.id + " not found")
                    console.warn("Did not find ride for leg:")
                    console.warn(leg)
                    console.warn("Timetable might be out of date or train is international with missing legs")
                    console.groupEnd()
                    return false
                }

                let startIndex = ride.legs.findIndex(rideLeg => rideLeg.stationary && rideLeg.station.code === leg.from);
                let endIndex = ride.legs.findIndex(rideLeg => rideLeg.stationary && rideLeg.station.code === leg.to);

                let mesh = createTimelineSingle(ride, startIndex, endIndex, now);
                map.mapContent.plan_options.add(mesh)
            })
        })
    })
}
