import { FirstPersonControls } from "./three/flycontrols";

import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import { GeometryCollection, MultiPolygon, Position } from "geojson";
import { BackSide, BufferGeometry, Color, CylinderGeometry, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Object3D, Path, PerspectiveCamera, Raycaster, SRGBColorSpace, Scene, Shape, ShapeGeometry, SphereGeometry, Vector2, Vector3, WebGLRenderer } from "three";
import Stats from 'three/addons/libs/stats.module.js';
import { StaticData, Station, placeRides, projectCoordsToMap, projectCoordsToMapVec3, wpToArray } from "./app";
import { isDebugEnabled } from "./env";
import { remap } from "./number";
import { legLink_IterWithDistance } from "./rail/leglink";
import { PathPoint } from "./rail/path";
import { MovingLeg, Ride } from "./rail/ride";
import { asSeconds, currentDayOffset, fromSeconds } from "./time";

const NEAR_CLIP = 0.01
const FAR_CLIP = 200
const FOV = 75
const CAM_SPEED = 0.0005
const LOOK_SPEED = 0.0005;

const FUTURE_ITERATIONS = 30;
const FUTURE_STEP_SECONDS = 60;
const TIMELINE_ELEVATION_PER_SECOND = 0.00004;

const MAX_LOOKAHEAD_TIME_SECONDS = FUTURE_ITERATIONS * FUTURE_STEP_SECONDS

const lineColor = new Color(0xff0000)//.convertSRGBToLinear()
const stationColor = new Color(0x003082)//.convertSRGBToLinear()
const grassColor = new Color(0x1E4D19)//.convertSRGBToLinear()
const backgroundColor = new Color(0x002D7A)//.convertSRGBToLinear();
export const cursorColor = new Color(0xFF8552);

const timelineColor = new Color(0x999999)//.convertSRGBToLinear();
export const planColor = new Color(0xFFC917);

const SHOW_STATS = isDebugEnabled();

export type MapContent = {
    trains: Mesh,
    stations: Object3D,
    timeline: Line,
    plan_options: Object3D
}

export class TrainMap {
    scene: Scene;
    renderer: WebGLRenderer;
    camera: PerspectiveCamera;
    running: boolean;
    loopHandler: number;
    onTrainClick?: (r: Ride) => void
    onStationClick?: (s: Station) => void
    ctrl: FirstPersonControls;

    lastFrameTimestamp: DOMHighResTimeStamp;
    staticData: StaticData;
    instanceIdToRideMap: Map<number, Ride>;
    stats: any
    stationMap: any;
    stationMeshMap: any;

    zeroTime: number; // starttime of view, as dayoffset
    timeSpan: number; // duration of view, as dayoffset

    mapContent: MapContent;
    raycaster: Raycaster;
    cursor: Mesh;
    cursorTime: undefined | number
    onCursorTimeChange: undefined | ((a: number | undefined) => void)
    constructor(private data: StaticData, document: Document, container: HTMLElement) {
        const scene = new Scene()
        const renderer = new WebGLRenderer({
            antialias: true,
            logarithmicDepthBuffer: true
        })
        this.staticData = data
        this.zeroTime = currentDayOffset();
        this.timeSpan = fromSeconds(3600 * 2)


        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.outputColorSpace = SRGBColorSpace
        // renderer.outputEncoding = sRGBEncoding
        container.appendChild(renderer.domElement)

        const camera = new PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR_CLIP, FAR_CLIP)
        camera.position.fromArray([80.76576494808796, 0.6901928260267816, 7.411009962151727])
        camera.rotation.fromArray([-1.5662642698302702, -0.970986368346586, -1.565305889572168, "XYZ"])

        // Must happen after inserting the renderer's element
        const ctrl = new FirstPersonControls(camera, renderer.domElement)

        ctrl.activeLook = true
        // ctrl.autoMove = false
        ctrl.mouseDragOn = false // No mousedragons
        ctrl.movementSpeed = CAM_SPEED
        ctrl.lookSpeed = LOOK_SPEED;
        ctrl.shiftBoostFactor = 10;

        this.ctrl = ctrl
        this.scene = scene;
        this.renderer = renderer
        this.camera = camera

        this.instanceIdToRideMap = new Map<number, Ride>();

        window.addEventListener('resize', () => this.handleResize(), { passive: true });

        this.running = false;

        this.mapContent = this.populateScene()

        if (SHOW_STATS) {
            this.stats = new Stats();
            container.appendChild(this.stats.dom)
        }
    }
    populateScene(): MapContent {
        const { scene, camera, data } = this

        // Sky
        scene.background = backgroundColor;

        // NL surface
        const grassMat = new MeshBasicMaterial({ color: grassColor })
        const map_geometry = geometryFromGeoJson(this.data.map_geo)
        grassMat.side = BackSide
        map_geometry.rotateX(Math.PI / 2)
        const mapMesh = new Mesh(map_geometry, grassMat)
        scene.add(mapMesh)


        // Routes
        const lineMaterial = new LineBasicMaterial({ color: lineColor, linewidth: 10, opacity: .5, transparent: true })
        const lineGeometry = new BufferGeometry()
        lineGeometry.setFromPoints(wpToArray(data.links))
        const routes = new LineSegments(lineGeometry, lineMaterial)
        scene.add(routes)

        // Timeline
        const timeLineMesh = createTimelineAll(data, this.zeroTime, this.zeroTime + this.timeSpan);
        scene.add(timeLineMesh)


        // Train models
        const rideMesh = placeRides(data, this.instanceIdToRideMap)
        scene.add(rideMesh)

        // Stations
        const maxElevation = asSeconds(this.timeSpan) * TIMELINE_ELEVATION_PER_SECOND;
        const { stationMesh, stationMeshMap } = createStationMesh(this.data, maxElevation)
        scene.add(stationMesh);
        this.stationMeshMap = stationMeshMap;

        // PLan lines
        const plans = new Object3D();
        scene.add(plans);

        const cursorMaterial = new MeshBasicMaterial({ color: cursorColor })
        cursorMaterial.wireframe = true
        cursorMaterial.opacity = 0.5
        this.cursor = new Mesh(new SphereGeometry(0.01, 8, 8), cursorMaterial)
        this.scene.add(this.cursor);


        this.raycaster = new Raycaster()
        this.raycaster.params.Line.threshold = 0.01;

        document.addEventListener("click", e => {
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = (e.clientY / window.innerHeight) * -2 + 1;

            this.raycaster.setFromCamera(new Vector2(x, y), camera)
            const rideCastResult = this.raycaster.intersectObject(rideMesh)

            if (rideCastResult.length > 0) {
                const instanceId = rideCastResult[0].instanceId
                const ride = this.instanceIdToRideMap.get(instanceId)

                console.debug(ride);

                this?.onTrainClick(ride)
                return;
            }


            const stationCastResult = this.raycaster.intersectObject(stationMesh);
            if (stationCastResult.length > 0) {
                const first = stationCastResult[0];
                const station = this.stationMeshMap.get(first.object);
                this?.onStationClick(station)
                return
            }
        })

        document.addEventListener("pointermove", e => {
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = (e.clientY / window.innerHeight) * -2 + 1;
            let castResult: Parameters<typeof Raycaster.prototype.intersectObject>[2] = []; // I miss Rust's type inferrence 



            this.raycaster.setFromCamera(new Vector2(x, y), camera)
            this.raycaster.intersectObject(timeLineMesh, false, castResult)

            if (castResult.length > 0) {
                const result = castResult[0];
                this.cursor.visible = true;
                this.cursor.position.copy(result.point);
                this.handleCursorChange(this.elevationToTime(result.point.y));
            } else {
                this.cursor.visible = false;
                this.handleCursorChange(undefined);
            }

            castResult.length = 0; // Required when passing an array as output to intersectObject
        })

        // Development aid
        document.addEventListener("keydown", e => {
            if (e.key === " ") {

                console.log(`
            camera.position.fromArray(${JSON.stringify(camera.position.toArray())})
            camera.rotation.fromArray(${JSON.stringify(camera.rotation.toArray())})
            `)
            }
        })

        return {
            trains: rideMesh,
            timeline: timeLineMesh,
            stations: stationMesh,
            plan_options: plans

        }
    }

    private handleCursorChange(time: number | undefined) {
        if (time !== this.cursorTime) {
            this.cursorTime = time;
            this.onCursorTimeChange?.(time);
        }
    }

    elevationToTime(y: number) {
        const ground = elevationForTime(this.zeroTime, this.zeroTime);
        const ceiling = elevationForTime(this.zeroTime, this.zeroTime + this.timeSpan)

        return remap(y, ground, ceiling, this.zeroTime, this.zeroTime + this.timeSpan) // TODO cleanup
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.ctrl.handleResize()
    }

    renderOnce(dt: number) {
        if (SHOW_STATS) {
            this.stats.update();
        }
        this.ctrl.update(dt)
        this.renderer.render(this.scene, this.camera)
    }

    onRAF(timestamp: DOMHighResTimeStamp) {
        const dt = timestamp - this.lastFrameTimestamp;
        this.lastFrameTimestamp = timestamp

        if (this.running) {
            this.loopHandler = requestAnimationFrame((ts) => this.onRAF(ts))
        }
        this.renderOnce(dt)
    }

    startLoop() {
        this.running = true
        this.lastFrameTimestamp = performance.now();
        this.onRAF(1000 / 60)
    }

    endLoop() {
        this.running = false;
        window.cancelAnimationFrame(this.loopHandler)
    }
}

// Creates the mesh that visualizes the future position of rides
function createTimelineAll(data: StaticData, startTime: number, endTime: number): Line {
    const { rides, links } = data

    // const startTime = fromHourSecond(0, 0);
    // const endTime = fromHourSecond(32, 0);

    const points: Vector3[] = [];

    rides.map(ride => appendRidePointsAll(startTime, endTime, ride, points));

    const geometry = new BufferGeometry().setFromPoints(points)
    const material = new LineBasicMaterial({ opacity: 0.5, color: timelineColor })

    const mesh = new LineSegments(geometry, material)
    return mesh
}

function elevationForTime(base_time: number, current_time: number) {
    const height = current_time - base_time;
    return asSeconds(height) * TIMELINE_ELEVATION_PER_SECOND
}

export function createTimelineSingle(ride: Ride, from: number, to: number, now: number, color: Color) {
    const points: Vector3[] = [];
    let lastPoint = null;

    for (let index = from; index <= to && index < ride.legs.length; index++) {
        const leg = ride.legs[index] as MovingLeg;
        let legDistance = 0;
        if (leg.stationary) { continue };

        leg.links.forEach(link => {
            legLink_IterWithDistance(link, (point: PathPoint, distanceTraveled: number) => {
                const timeAtPoint = remap(distanceTraveled + legDistance, 0, leg.link_distance, leg.startTime, leg.endTime)
                const coords = projectCoordsToMapVec3(point.coordinates)
                coords.setY(elevationForTime(now, timeAtPoint)) // TODO, proper timing

                //First run only
                if (lastPoint === null) {
                    lastPoint = coords;
                    return
                }

                //Always push the   two points of a line segment
                points.push(lastPoint)
                points.push(coords)

                lastPoint = coords;
            })

            legDistance += link.Link.path.pathLength;
        })
    }


    const geometry = new BufferGeometry().setFromPoints(points)
    const material = new LineBasicMaterial({ opacity: 0.5, color })

    const mesh = new LineSegments(geometry, material)
    return mesh
}

const stationRadius = 0.001
const stationMaterial = new MeshBasicMaterial({ color: stationColor });

function appendRidePointsAll(startTime: number, endTime: number, ride: Ride, points: Vector3[]) {
    let lastPoint = null;


    for (const leg of ride.legs as MovingLeg[]) {
        let legDistance = 0;
        if (leg.stationary) { continue };

        leg.links.forEach(link => {
            legLink_IterWithDistance(link, (point: PathPoint, distanceTraveled: number) => {
                const timeAtPoint = remap(distanceTraveled + legDistance, 0, leg.link_distance, leg.startTime, leg.endTime)
                if (timeAtPoint < startTime || timeAtPoint > endTime) {
                    return
                }
                const coords = projectCoordsToMapVec3(point.coordinates)
                coords.setY(elevationForTime(startTime, timeAtPoint)) // TODO, proper timing

                //First run only
                if (lastPoint === null) {
                    lastPoint = coords;
                    return
                }

                //Always push the two points of a line segment
                points.push(lastPoint)
                points.push(coords)

                lastPoint = coords;
            })

            legDistance += link.Link.path.pathLength;
        })
    }

}

function createStationMesh(data: StaticData, height: number): { stationMesh: Object3D, stationMeshMap: Map<Object3D, Station> } {
    const allStations = new Object3D();
    const map = new Map();

    const stationGeometry = new CylinderGeometry(stationRadius, stationRadius, height, 6, 1, false);

    for (const station of data.stationMap.values()) {
        const mesh = new Mesh(stationGeometry, stationMaterial)
        mesh.position.add(projectCoordsToMapVec3(station.position))
        mesh.position.add(new Vector3(0, height / 2, 0))
        allStations.add(mesh)
        map.set(mesh, station)
    }

    return {
        stationMesh: allStations,
        stationMeshMap: map
    };

}

function assertEq(left, right) {
    if (left !== right) {
        throw new Error(`Expected ${left} to equal ${right}`);
    }
}

function geometryFromGeoJson(map_geo: GeometryCollection): BufferGeometry {
    assertEq(map_geo.type, "GeometryCollection")

    let out = map_geo.geometries.map(feature => {
        assertEq(feature.type, "MultiPolygon")

        feature = feature as MultiPolygon;

        const shapes: ShapeGeometry[] = feature.coordinates.map(polygonToShape)
        return BufferGeometryUtils.mergeGeometries(shapes)
    })

    return out[0]
}

function polygonToShape(polygon: Position[][]): ShapeGeometry {
    const shape = polygon[0];
    const holes = polygon.slice(1);

    const geo = new Shape();

    for (let index = 0; index < shape.length; index++) {
        const [longitude, latitude] = shape[index];
        const [x, y] = projectCoordsToMap({ latitude, longitude });

        if (index === 0) {
            geo.moveTo(x, y)
        } else {
            geo.lineTo(x, y)
        }
    }

    geo.holes = holes.map(coordsToPath)

    return new ShapeGeometry(geo)
}

function coordsToPath(path: Position[]): Path {
    const p = new Path();
    for (let index = 0; index < path.length; index++) {
        const [longitude, latitude] = path[index];
        const [x, y] = projectCoordsToMap({ latitude, longitude });

        if (index === 0) {
            p.moveTo(x, y)
        } else {
            p.lineTo(x, y)
        }

    }

    return p
}