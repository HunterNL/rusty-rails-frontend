
import { BufferGeometry, FrontSide, InstancedMesh, Matrix4, MeshBasicMaterial, NearestFilter, SRGBColorSpace, Texture, Vector3 } from "three"
import { mercator } from "./geo"
import { harvest } from "./harvest"
import { TrainMap, createTimelineSingle } from "./jsm/map"
import { createRideSideBar, createStationSidebar, renderStationPassages } from "./jsm/sidebar"
import { LegLink } from "./leglink"
import { link } from "./link"
import { Ride, isActiveAtTime, realPosition, trainPosition } from "./ride"
import { findPath, getData, parseData } from "./server"
import { Sidebar } from "./sidebar"
import { StationPassageRepo } from "./stoprepo"
import { currentDayOffset, fromSeconds } from "./time"
import { Coordinates, joinWith, onDomReady } from "./util"

const TRAIN_UPDATE_INTERVAL_MS = 60
const TRACK_SIDEWAYS_OFFSET = 2.5
const TRAIN_SCALE = 0.0017;

export const API_HOST = "https://api.dev.localhost/"

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

export type StaticData = {
    links: link[]
    rides: Ride[]
    stationMap: Map<string, Station>
    linkMap: Map<string, link>,
    model: any
    map_geo: any,
    stationPassages: StationPassageRepo
}

onDomReady(() => {
    setupHotReload()

    const sidebar = new Sidebar(document.getElementById("sidebar"))
    document.querySelectorAll("[data-action='sidebar_close']").forEach(e => e.addEventListener("click", () => sidebar.hide()))

    window.addEventListener("keydown", e => {
        if (e.key === "Escape") {
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

function updateRides(mesh: InstancedMesh, data: StaticData, instanceIndexToRideMap: Map<number, Ride>, currentTime: number): void {
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

export function placeRides(data: StaticData, dataMap: Map<number, Ride>): InstancedMesh {
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


function originIsolationCheck() {
    if (!crossOriginIsolated) {
        console.warn("Page is not origin isolated, performance.now() will be less accurate")
    }
}

originIsolationCheck()

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

                let mesh = createTimelineSingle(ride, startIndex, endIndex, now);
                map.mapContent.plan_options.add(mesh)
            })
        })
    })
}
