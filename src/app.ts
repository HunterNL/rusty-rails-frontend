
import { BufferGeometry, FrontSide, InstancedMesh, Matrix4, MeshBasicMaterial, NearestFilter, sRGBEncoding, Texture, Vector3 } from "three"
import { ESMap } from "typescript"
import { GLTFLoader } from "./jsm/GLTFLoader"
import { TrainMap } from "./jsm/map"
import { Sidebar } from "./sidebar"
import { Coordinates, joinWith, onDomReady } from "./util"
import { createRideSideBar, createStationSidebar, renderStationPassages } from "./jsm/sidebar"
import { getStops, isActiveAtTime, trainPosition } from "./ride"
import { asSeconds, currentDayOffset, fromSeconds } from "./time"
import { Stop} from "./stop"
import { newPassageRepo, StationPassageRepo } from "./stoprepo"
import { mercator } from "./geo";

const TRAIN_UPDATE_INTERVAL_MS = 500
const TRACK_SIDEWAYS_OFFSET = 2.5
const TRAIN_SCALE = 0.0017;

const API_HOST="https://api.dev.localhost/"



export type RideJSON = {
    id: number   
    startTime: number,
    endTime: number
    distance: number
    dayValidity: number
    legs: LegJSON[]
    rideIds: RideIdJSON[]
}

export type RideIdJSON= {
    "company_id": number,
    "ride_id": number | null,
    "line_id": number | null,
    "first_stop": number,
    "last_stop": number,
    "ride_name": null
}


function parseRide(rideJson: RideJSON, stations: Map<string,Station>,links: Map<string, link>) : Ride {
    let legs = rideJson.legs.map((legJson,index) => parseLeg(legJson,index,rideJson,stations,links)) 

    
    return {
        id: rideJson.id,
        distance: rideJson.distance,
        endTime: rideJson.endTime,
        startTime: rideJson.startTime,
        ride_ids: [],
        stops: getStops(legs),
        legs,
    }
}

function create_link_codes(start:string,end:string,waypoints: string[]): string[] {
    let codes = [start,...waypoints,end];
    return joinWith(codes,(left,right) => {
        return left+"_"+right
    })
}

function rideIdsForLegNumber(ride: RideJSON, leg: LegJSON): RideIdJSON[] {
    return ride.rideIds
}

function parseLeg(json: LegJSON,index:number,rideJson: RideJSON, stations: Map<string,Station>,links: Map<string,link>) : Leg {
    // const common : Partial<Leg> = {
    //     endTime: json.end,
    //     startTime: json.start

    // }

    if(json.moving) {
        const link_codes = create_link_codes(json.from, json.to, json.waypoints);

        return {
            endTime: json.timeEnd,
            startTime: json.timeStart,
            from: json.from,
            to: json.to,
            stationary: false,
            link_codes,
            links: link_codes.map(code => linkLegFromCode(links, code))
            // TODO Add rideId here
        }
        

    } else {
        return {
            endTime: json.timeEnd,
            startTime: json.timeStart,
            station: stations.get(json.stationCode),
            stationary: true,
            stopType: json.stopType,
            platforms: json.platform,
            rideId: rideIdsForLegNumber(rideJson, json)
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
    "timeStart":  number
    "timeEnd":  number
    "moving":  boolean
    "waypoints":  string[] | null
    "from":  string | null
    "to":  string | null
    "stationCode": string | null
    "platform":  PlatformJSON | null
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
    rideId: RideIdJSON[]
}

export type MovingLeg = {
    endTime: number;
    startTime: number;
    stationary: false;
    from: string;
    to: string
    links: LegLink[]
    link_codes: string[];
    // isReversing: boolean /** If the train is progessing against the order in the related link's points */
}

export type LegLink = {
    Link: link
    reversePointOrder: boolean;
}

export type Ride = {
    id: number
    distance: number
    stops: Stop[],
    startTime: number
    endTime: number
    legs: Leg[]
    ride_ids: RideId[]
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

export type Path=  {
    points: PathPoint[],
    len: number,
}

/**
 * A list of coordinates describing the track position, originating from station "From" leading to station "To"
 */
export type link = {
    from: string,
    to: string,
    path: Path
}

export type Station = {
    code: string,
    name: string,
    position: Coordinates

}

const MAP_SCALE = 90;

export function projectCoordsToMap(coords: Coordinates): [number,number] {
    const [x,y] = mercator(coords.latitude,coords.longitude);
    return [x*MAP_SCALE,y*MAP_SCALE]
}

export function projectCoordsToMapVec3(coords: Coordinates): Vector3 {

    const [x,y] = mercator(coords.latitude,coords.longitude);
    return new Vector3(x,0,y).multiplyScalar(MAP_SCALE)
}

export function vec3FromCoords(coords: Coordinates) : Vector3 {
    return new Vector3(coords.latitude,0,coords.longitude);
}

// Take an array of links, return an array of vector3's ready for a geometrybuffer
// We're using linesegments so every line gets it own two vertices
// While links.points is just a an array of points this function turns that into an array of segments with duplicate vertices
// Alternatives are ditching the whole one-buffer setup and having seperate objects, or using indices
export function wpToArray(links: link[]): Vector3[] {
    const a = links.map(wp => {
        return joinWith(wp.path.points, (left, right) => {
            return [projectCoordsToMapVec3(left.coordinates),projectCoordsToMapVec3(right.coordinates)]
        })
    })

    return a.flat(2);
}

export function findLink(links: link[], a: string, b: string): link {
    return links.find(l => (l.from == a && l.to == b) || (l.from == b && l.to == a))
}

export type RemoteData = {
    links: link[]
    stations: Station[]
    rides: RideJSON[]
    model: any
    map_geo: any
}

export type StaticData = {
    links: link[]
    rides: Ride[]
    stationMap: Map<string, Station>
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

// Process and transform data in structures more useful locally
function parseData(remoteData: RemoteData): StaticData {
    const { links, model } = remoteData;

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
        links, rides, stationMap, model, map_geo: remoteData.map_geo,stationPassages:passages
    }
}

// Fetch remote data in parallel 
async function getData(): Promise<RemoteData> {
    const linkspr: Promise<link[]> = fetch(API_HOST+"data/links.json").then(f => f.json()).then(f => f)
    const stationspr: Promise<Station[]> = fetch(API_HOST+"data/stations.json").then(f => f.json()).then(f => f)
    const ridespr: Promise<RideJSON[]> = fetch(API_HOST+"api/activerides").then(f => f.json()).then(f => f)

    const map_geopr: Promise<object> = fetch("/data/nl_map.json").then(f => f.json())

    const modelLoader = new GLTFLoader()
    const modelpr = modelLoader.loadAsync("/assets/lowpolytrain.glb")

    let [links, stations, rides, model,map_geo] = await Promise.all([linkspr, stationspr, ridespr, modelpr,map_geopr])

    return { links, stations, rides, model, map_geo }
}

onDomReady(() => {
    new EventSource('/esbuild').addEventListener('change', () => location.reload()) // Esbuild live reload

    const sidebar = new Sidebar(document.getElementById("sidebar"))
    document.querySelectorAll("[data-action='sidebar_close']").forEach(e => e.addEventListener("click", () => sidebar.hide()))

    window.addEventListener("keydown", e => {
        if(e.key == "Escape") {
            sidebar.hide()
        }
    })
    setupMap(sidebar)
})



function updateRides(mesh: THREE.InstancedMesh, data: StaticData, instanceIndexToRideMap: ESMap<number, Ride>,currentTime: number): void {
    const { rides, links } = data

    let count = 0;

    for (let index = 0; index < rides.length; index++) {
        
        const ride = rides[index];
        instanceIndexToRideMap.set(index, ride)

        if (!isActiveAtTime(ride, currentTime)) {
            continue
        }

        const pos = trainPosition(ride, currentTime)

        const up = new Vector3(0, 1, 0);
        const trainPos = projectCoordsToMapVec3(pos.position)
        const rot = new Vector3(pos.forward.x,0,pos.forward.y)

        // Offset to the right of travel direction
        const right = new Vector3().crossVectors(rot, up)
        
        trainPos.addScaledVector(right, -TRAIN_SCALE*TRACK_SIDEWAYS_OFFSET)

        const mat4 = new Matrix4()
        mat4.lookAt(new Vector3, rot, new Vector3(0, 1, 0))
        mat4.setPosition(trainPos)

        mesh.setMatrixAt(index, mat4)
        count++
    }
    mesh.instanceMatrix.needsUpdate = true
    
}

export function placeRides(data: StaticData, dataMap: ESMap<number, Ride>): THREE.InstancedMesh {
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


    trainMat.map.encoding = sRGBEncoding
    trainGeo.scale(TRAIN_SCALE, TRAIN_SCALE, TRAIN_SCALE)

    const mesh = new InstancedMesh(trainGeo, trainMat, rides.length)


    updateRides(mesh, data, dataMap,currentDayOffset() )

    window.setInterval((dt) => {
        const currentTime = currentDayOffset() 
        updateRides(mesh, data, dataMap,currentTime)
    }, TRAIN_UPDATE_INTERVAL_MS)


    return mesh
}

async function setupMap(sidebar: Sidebar) {
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
        let end = now + fromSeconds(3600*2)

        if(passages) {
            sidebar.renderIntoChild("instanceid", renderStationPassages(passages,currentDayOffset(),end))
        } else {
            sidebar.renderIntoChild("instanceid", createStationSidebar(station))
        }
        
    }
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