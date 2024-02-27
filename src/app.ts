
import { BufferGeometry, FrontSide, InstancedMesh, Matrix4, MeshBasicMaterial, NearestFilter, sRGBEncoding, Texture, Vector3 } from "three"
import { ESMap } from "typescript"
import { GLTFLoader } from "./jsm/GLTFLoader"
import { TrainMap } from "./jsm/map"
import { Sidebar } from "./sidebar"
import { greatCircleDistance, joinWith, onDomReady, remap } from "./util"
import { createSideBar } from "./jsm/sidebar"
import { getStops, isActiveAtTime, trainPosition } from "./ride"
import { currentDayOffset } from "./time"
import { Stop, StopTypeFromObjKey } from "./stop"

const TRAIN_UPDATE_INTERVAL_MS = 500

const API_HOST="https://api.dev.localhost/"



export type RideJSON = {
    id: number
    
    startTime: number,
    endTime: number
    distance: number
    dayValidity: number
    legs: LegJSON[]
}


function parseRide(json: RideJSON, stations: Map<string,Station>,links: Map<string, link>) : Ride {
    let legs = json.legs.map(j => parseLeg(j,stations,links)) 

    
    return {
        id: json.id,
        distance: json.distance,
        endTime: json.endTime,
        startTime: json.startTime,
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

function parseLeg(json: LegJSON,stations: Map<string,Station>,links: Map<string,link>) : Leg {
    // const common : Partial<Leg> = {
    //     endTime: json.end,
    //     startTime: json.start
    // }

    if("Stationary" in json) {
        return {
            endTime: json.end,
            startTime: json.start,
            station: stations.get(json.Stationary[0]),
            stationary: true,
            stopType: StopTypeFromObjKey(json.Stationary[1])
        } 
        
    }
    if("Moving" in json) {
        
        const link_codes = create_link_codes(json.Moving[0], json.Moving[1], json.Moving[2]);

        return {
            endTime: json.end,
            startTime: json.start,
            from: json.Moving[0],
            to: json.Moving[1],
            stationary: false,
            link_codes,
            links: link_codes.map(code => linkLegFromCode(links, code))
            
        } 
        
    }
}


/**
 *  A segment between or at stops, specific to a single Ride  
 */
export type LegJSON = {
    start: number,
    end: number,
} & ({
    Stationary: string,
    Stoptype: number
}|{
    Moving: [string,string,string[]]
})

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
    station: Station
    stopType: number
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
    coordinates: {lat:number,lon:number},
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
    position: {
        lat: number, 
        lon: number
    }

}

export function vec3FromCoords(coords:{lat:number,lon:number}) : Vector3 {
    return new Vector3(coords.lat,0,coords.lon);
}

// Take an array of links, return an array of vector3's ready for a geometrybuffer
// We're using linesegments so every line gets it own two vertices
// While links.points is just a an array of points this function turns that into an array of segments with duplicate vertices
// Alternatives are ditching the whole one-buffer setup and having seperate objects, or using indices
export function wpToArray(links: link[]): Vector3[] {
    const a = links.map(wp => {
        return joinWith(wp.path.points, (left, right) => {
            return [vec3FromCoords(left.coordinates),vec3FromCoords(right.coordinates)]
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
}

export type StaticData = {
    links: link[]
    rides: Ride[]
    stationMap: Map<string, Station>
    model: any
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

    // console.log(linkMap)

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



    return {
        links, rides, stationMap, model
    }
}

// Fetch remote data in parallel 
async function getData(): Promise<RemoteData> {
    const linkspr: Promise<link[]> = fetch(API_HOST+"data/links.json").then(f => f.json()).then(f => f)
    const stationspr: Promise<Station[]> = fetch(API_HOST+"data/stations.json").then(f => f.json()).then(f => f)
    const ridespr: Promise<RideJSON[]> = fetch(API_HOST+"api/activerides").then(f => f.json()).then(f => f)

    const modelLoader = new GLTFLoader()
    const modelpr = modelLoader.loadAsync("/assets/lowpolytrain.glb")

    let [links, stations, rides, model] = await Promise.all([linkspr, stationspr, ridespr, modelpr])

    return { links, stations, rides, model }
}

onDomReady(() => {
    new EventSource('/esbuild').addEventListener('change', () => location.reload()) // Esbuild live reload

    const sidebar = new Sidebar(document.getElementById("sidebar"))
    document.querySelectorAll("[data-action='sidebar_close']").forEach(e => e.addEventListener("click", () => sidebar.setVisible(false)))
    setupMap(sidebar)
})



function updateRides(mesh: THREE.InstancedMesh, data: StaticData, instanceIndexToRideMap: ESMap<number, Ride>): void {
    const { rides, links } = data

    
    let count = 0;

    const currentTime = currentDayOffset() 
    // console.log(currentTime);
    

    for (let index = 0; index < rides.length; index++) {
        // console.log("updatedirde");
        
        const ride = rides[index];
        instanceIndexToRideMap.set(index, ride)

        if (!isActiveAtTime(ride, currentTime)) {
            continue
        }

        const { pos, rot } = trainPosition(ride, currentTime)

        const up = new Vector3(0, 1, 0);
        const trainPos = new Vector3(pos.x, 0, pos.y)

        // Offset to the right of travel direction
        const right = new Vector3().crossVectors(rot, up)
        trainPos.addScaledVector(right, -0.002)

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

    // console.log("placerides",rides);
    

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
    trainGeo.scale(0.001, 0.001, 0.001)

    const mesh = new InstancedMesh(trainGeo, trainMat, rides.length)

    updateRides(mesh, data, dataMap)

    window.setInterval((dt) => {
        updateRides(mesh, data, dataMap)
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
        sidebar.setVisible(true)
        sidebar.renderIntoChild("instanceid", createSideBar(ride, trainMap.staticData))
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