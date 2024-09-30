
import { BufferGeometry, FrontSide, InstancedMesh, Matrix4, MeshBasicMaterial, NearestFilter, SRGBColorSpace, Texture, Vector3 } from "three"
import { GLTF } from "three/examples/jsm/Addons.js"
import { joinWith } from "./array"
import { onDomReady } from "./dom/domready"
import { harvest } from "./dom/harvest"
import { createTrips } from "./dom/render/planner_trips"
import { createRideSideBar, createStationSidebar, renderStationPassages } from "./dom/render/sidebar"
import { Sidebar } from "./dom/sidebar"
import { isDebugEnabled } from "./env"
import { originatesFromForm } from "./events"
import { Coordinates, mercator } from "./geo"
import { LineVisualType, TrainMap, createTimelineSingle, cursorColor, planColor } from "./map"
import { LegLink } from "./rail/leglink"
import { link } from "./rail/link"
import { Ride, Trip, isActiveAtTime, realPosition, ride_stopIndexbyCode, trainPosition } from "./rail/ride"
import { findPath, getData, parseData } from "./server"
import { StationPassageRepo } from "./stoprepo"
import { currentDayOffset, formatDaySeconds, fromSeconds } from "./time"

const TRAIN_UPDATE_INTERVAL_MS = 60
const TRACK_SIDEWAYS_OFFSET = 2.5
const TRAIN_SCALE = 0.0017;

declare var DEFINE_API_HOST //set by Esbuild
export const API_HOST = DEFINE_API_HOST

export type PlatformJSON = {
    arrival_platform: string,
    departure_platform: string
    footnote: number // Unused clientside
}


export type TrackPosition = {
    leglink: LegLink // The leglink this position is located in
    offset: number   // Offset from the start of the link
}

export type Station = {
    code: string,
    name: string,
    position: Coordinates
    rank: number
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

export type Company = {
    name: string
    code: string,
    id: string
}

export type StaticData = {
    companies: Record<string, Company>
    locations: string[]
    links: link[]
    rides: Ride[]
    stationMap: Map<string, Station>
    linkMap: Map<string, link>,
    model: GLTF,
    model_flirt: GLTF
    map_geo: any,
    stationPassages: StationPassageRepo
}

function setupControlPanel(map: TrainMap) {

    const dropdown = document.querySelector("[data-field='line_color']") as HTMLOptionElement

    if (dropdown === null) {
        throw new Error("Control panel didn't find dropdown element!")
    }

    dropdown.addEventListener("change", e => {
        map.setLineStyle((e.target as any).value);
    })

    // Set the style right away as well
    // Autocomplete will retain the selected choice between refreshes and this ensures we're handling that
    map.setLineStyle(dropdown.value as LineVisualType)
}

onDomReady(() => {
    if (isDebugEnabled()) {
        setupHotReload()
    }

    //Timer
    const timer_element = document.querySelector('[data-tag=timer]');
    if (!timer_element) {
        throw new Error("Expected timer element")
    }
    setupTimer(timer_element);

    // Sidebar
    const sidebar = new Sidebar(document.getElementById("sidebar"))
    document.querySelectorAll("[data-action='sidebar_close']").forEach(e => e.addEventListener("click", () => sidebar.hide()))

    window.addEventListener("keydown", e => {
        if (e.key === "p") {
            if (!originatesFromForm(e)) {
                document.body.classList.toggle("ui_hidden");
            }

        }

        if (e.key === "Escape") {
            sidebar.hide()
        }
    })
    // Map
    getData().then(parseData).then(data => {
        // Create copy
        const stations: Station[] = [];
        for (let station of data.stationMap.values()) {
            stations.push(station)
        }

        stations.sort((a, b) => b.rank - a.rank);
        const station_names = stations.map(s => s.name);

        const form = document.getElementById("plan_form");
        const trip_list = document.getElementById("trip_list")

        insertDataList("station_names", station_names);

        setupMap(sidebar, data).then(map => {
            //Cursor timer
            const timer = document.querySelector("[data-tag=cursor_timer]") as HTMLElement;
            timer.style.color = "#" + cursorColor.getHexString();
            map.onCursorTimeChange = (time) => {
                if (typeof time === "undefined") {
                    timer.style.visibility = "hidden";
                } else {
                    timer.style.visibility = "visible";
                    timer.textContent = formatDaySeconds(time)
                }
            }

            setupForm(data, form, trip_list, map);
            setupControlPanel(map)
        }).catch(e => console.error(e))
    })

    // Settings panel
    document.querySelector("[data-field='line_color']").addEventListener("change", e => {

    })
})



function setupHotReload() {
    new EventSource('/esbuild').addEventListener('change', () => location.reload())
}

export type TrainMeshes = {
    virm: InstancedMesh
    flirt: InstancedMesh
}

function updateRides(meshes: TrainMeshes, rides: Ride[], currentTime: number): void {
    let index_counters = {}
    Object.keys(meshes).forEach(key => {
        index_counters[key] = 0;
    })

    for (let i = 0; i < rides.length; i++) {
        const ride = rides[i];

        if (!isActiveAtTime(ride, currentTime)) {
            continue
        }

        let meshName = ride.model;
        let mesh = meshes[meshName];
        let meshIndex = index_counters[meshName];

        mesh.userData.idMap.set(meshIndex, ride)

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

        mesh.setMatrixAt(meshIndex, mat4)
        index_counters[meshName]++
    }

    Object.values(meshes).forEach(mesh => {
        mesh.instanceMatrix.needsUpdate = true
    })
}

export function modelNameForTransitType(transitType: string): "virm" | "flirt" {
    if (transitType === "IC") {
        return "virm";
    }

    if (transitType === "SPR" || transitType === "ST") {
        return "flirt";
    }

    // console.log("unknown model for " + transitType)

    return "virm"

}

function modelByName(data: StaticData, name: string): any {
    if (name === "virm") {
        return data.model;
    }

    if (name === "flirt") {
        return data.model_flirt
    }

    throw new Error("Unknown model: " + name)
}

export function placeRides(data: StaticData, dataMap: Map<number, Ride>): TrainMeshes {
    let meshes: TrainMeshes = {
        virm: createInstancedMesh(data.model, data.rides.length),
        flirt: createInstancedMesh(data.model_flirt, data.rides.length),
    }

    // Note, this is independant from the time the Map uses
    updateRides(meshes, data.rides, currentDayOffset())

    window.setInterval((dt) => {
        // Note, this is independant from the time the Map uses
        updateRides(meshes, data.rides, currentDayOffset())
    }, TRAIN_UPDATE_INTERVAL_MS)


    return meshes
}

function createInstancedMesh(model: any, ride_count: number): InstancedMesh {
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

    let mesh = new InstancedMesh(trainGeo, trainMat, ride_count)
    mesh.userData.idMap = new Map();
    return mesh
}

async function setupMap(sidebar: Sidebar, data: StaticData): Promise<TrainMap> {
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
            sidebar.renderIntoChild("instanceid", renderStationPassages(passages, now, end))
        } else {
            sidebar.renderIntoChild("instanceid", createStationSidebar(station))
        }

    }

    return trainMap
}


function originIsolationCheck() {
    if (!crossOriginIsolated) {
        console.warn("Page is not origin isolated, performance.now() will be less accurate")
    }
}

function findMapEntryByValue<K, V>(haystack: Map<K, V>, predicate: (a: V) => boolean): [K, V] | undefined {
    for (let entry of haystack.entries()) {
        if (predicate(entry[1]))
            return entry
    }
}

originIsolationCheck()

function findStationCode(searchString: string, stations: Map<string, Station>): string | undefined {
    let lowerstring = searchString.toLowerCase()
    if (stations.has(lowerstring)) {
        return lowerstring
    }

    let entry = findMapEntryByValue(stations, (s) => s.name.toLowerCase() == lowerstring);
    if (entry) {
        return entry[0]
    }

    return undefined
}

function setupForm(staticData: StaticData, form: HTMLElement, outputElem: HTMLElement, map: TrainMap) {
    form.addEventListener("submit", e => {
        e.preventDefault()
        let formdata = harvest(form)
        map.mapContent.plan_options.children.forEach(c => c.removeFromParent())

        let from = findStationCode(formdata.from, staticData.stationMap);
        let to = findStationCode(formdata.to, staticData.stationMap);

        if (typeof from === "undefined") {
            console.warn(from)
            throw new Error("From station invalid")
        }

        if (typeof to === "undefined") {
            console.warn(to)
            throw new Error("To station invalid")
        }

        findPath(staticData, from, to).then(res => {
            let validTrips = joinTripsWithRides(res.trips, res.rides);

            // Show on sidebar
            outputElem.innerHTML = "";
            outputElem.appendChild(createTrips(validTrips));

            // Show on map
            const now = map.zeroTime

            res.trips.flatMap(trip => trip.legs).map(leg => {
                leg.from = leg.from.toLowerCase()
                leg.to = leg.to.toLowerCase()
            })

            res.trips.flatMap(trip => trip.legs).map(leg => {
                let ride = res.rides.find(ride => ride.id.toString() === leg.id)
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

                let mesh = createTimelineSingle(ride, startIndex, endIndex, now, planColor);
                map.mapContent.plan_options.add(mesh)
            })
        })
    })
}
function insertDataList(id: string, station_names: string[]) {
    const list = document.createElement("datalist")
    station_names.forEach(name => {
        const option = document.createElement("option");
        option.setAttribute("value", name)
        list.appendChild(option)
    })

    list.id = id;
    document.documentElement.appendChild(list);
}

function setupTimer(timer_element: Element) {
    const fn = () => {
        timer_element.textContent = formatDaySeconds(currentDayOffset());
    };

    const _interval = window.setInterval(fn, 1000)
    fn()
}

export type TripRideLeg = {
    ride: Ride,
    from: number
    to: number
}

function joinRides(trip: Trip, rides: Ride[]): TripRideLeg[] {
    return trip.legs.map(leg => {
        let ride = rides.find(r => r.id.toString() === leg.id);
        let from = ride_stopIndexbyCode(ride, leg.from.toLowerCase())
        let to = ride_stopIndexbyCode(ride, leg.to.toLowerCase());

        return { ride, from, to }
    })
}

function joinTripsWithRides(trips: Trip[], rides: Ride[]): TripRideLeg[][] {
    // Filter out trips that miss rides
    const valid_trips = trips.filter(trip => trip.legs.every(leg => rides.some(ride => ride.id.toString() === leg.id)));

    return valid_trips.map(trip => joinRides(trip, rides))
}

