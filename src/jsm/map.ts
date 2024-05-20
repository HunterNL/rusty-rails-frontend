import { FirstPersonControls } from "../jsm/flycontrols";

import { ArrowHelper, AxesHelper, BackSide, BufferGeometry, Color, CylinderBufferGeometry, DoubleSide, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneBufferGeometry, Raycaster, Scene, Shape, ShapeBufferGeometry, sRGBEncoding, Vector3, WebGLRenderer } from "three";
import { MovingLeg, PathPoint, placeRides, projectCoordsToMap, projectCoordsToMapVec3, Ride, StaticData, Station, wpToArray } from "../app";
import { isActiveAtTime, realPosition, trainPosition } from "../ride";
import { currentDayOffset } from "../time";
import Stats from "./stats.module.js"; // TODO Conditional import, ESBuild has some preprocessor magic for this, or maybe treeshaking works now?
import { ESMap } from "typescript";
import { legLink_Iter } from "../leglink";

const NEAR_CLIP = 0.01
const FAR_CLIP = 200
const FOV = 75
const CAM_SPEED = 0.0005
const LOOK_SPEED = 0.0005;

const FUTURE_ITERATIONS = 30;
const FUTURE_STEP_SECONDS = 60;
const FUTURE_Z_STEP = 0.002;

const MAX_LOOKAHEAD_TIME_SECONDS = FUTURE_ITERATIONS * FUTURE_STEP_SECONDS

const lineColor = new Color(0xff0000).convertSRGBToLinear()
const stationColor = new Color(0x003082).convertSRGBToLinear()
const grassColor = new Color(0x1B3622).convertSRGBToLinear()
const backgroundColor = new Color(0x192F36).convertSRGBToLinear();

const timelineColor = new Color(0x999999).convertSRGBToLinear();

const SHOW_STATS = true; // TODO Prod toggle

export type MapContent = {
    trains: Mesh,
    stations: Object3D,
    timeline: Line,
    plan_options: Object3D
}

export class TrainMap {
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
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
    mapContent: MapContent;
    constructor(private data: StaticData, document: Document, container: HTMLElement) {
        const scene = new Scene()
        const renderer = new WebGLRenderer({
            antialias: true,
            logarithmicDepthBuffer: true
        })
        this.staticData = data


        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.outputEncoding = sRGBEncoding
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

        // Ground plane
        // const infiniteplane = new PlaneBufferGeometry(1000, 1000, 1)
        // const grass = new Mesh(infiniteplane, grassMat)
        // grass.rotateX(-Math.PI / 2)
        // scene.add(grass);

        //NL Background
        const grassMat = new MeshBasicMaterial({ color: grassColor })
        const map_geometry = geometryFromGeoJson(this.data.map_geo)
        grassMat.side = BackSide
        map_geometry.rotateX(Math.PI / 2)
        const mapMesh = new Mesh(map_geometry, grassMat)
        // mapMesh.translateZ(-0.00001)
        scene.add(mapMesh)


        // Utrecht marker
        const utrecht_coords = { latitude: 52.09, longitude: 5.111 }
        const axis = new AxesHelper(.5)
        axis.position.add(projectCoordsToMapVec3(utrecht_coords))
        scene.add(axis)

        // Origin marker
        const center = new AxesHelper(1);
        scene.add(center);

        // Helper grid
        // const help = new GridHelper(200, 64)
        // scene.add(help)

        const zeroMeridian = new ArrowHelper(new Vector3(1, 0, 0), new Vector3(0, 0, 0), 1000)
        scene.add(zeroMeridian)

        // Routes
        const lineMaterial = new LineBasicMaterial({ color: lineColor, linewidth: 10, opacity: .5, transparent: true })
        const lineGeometry = new BufferGeometry()
        lineGeometry.setFromPoints(wpToArray(data.links))
        const routes = new LineSegments(lineGeometry, lineMaterial)
        scene.add(routes)

        // Timeline
        const timeLineMesh = createTimelineAll(data);
        scene.add(timeLineMesh)


        // Train models
        const rideMesh = placeRides(data, this.instanceIdToRideMap)
        scene.add(rideMesh)

        // Stations
        const { stationMesh, stationMeshMap } = createStationMesh(this.data)
        scene.add(stationMesh);
        this.stationMeshMap = stationMeshMap;

        // PLan lines
        const plans = new Object3D();
        scene.add(plans);



        const raycaster = new Raycaster()

        document.addEventListener("click", e => {
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = (e.clientY / window.innerHeight) * -2 + 1;

            raycaster.setFromCamera({ x, y }, camera)
            const rideCastResult = raycaster.intersectObject(rideMesh)

            if (rideCastResult.length > 0) {
                const instanceId = rideCastResult[0].instanceId
                const ride = this.instanceIdToRideMap.get(instanceId)

                console.debug(ride);

                this?.onTrainClick(ride)
                return;
            }


            const stationCastResult = raycaster.intersectObject(stationMesh);
            if (stationCastResult.length > 0) {
                const first = stationCastResult[0];
                const station = this.stationMeshMap.get(first.object);
                this?.onStationClick(station)
                return
            }
        })

        // Development aid
        document.addEventListener("keydown", e => {
            if (e.key == " ") {

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
function createTimelineAll(data: StaticData): Line {
    const { rides, links } = data

    const startTime = currentDayOffset()
    const points: Vector3[] = [];

    rides.map(ride => appendRidePointsAll(startTime, ride, points));

    const geometry = new BufferGeometry().setFromPoints(points)
    const material = new LineBasicMaterial({ opacity: 0.5, color: timelineColor })

    const mesh = new LineSegments(geometry, material)
    return mesh
}

export function createTimelineSingle(ride: Ride, from: number, to: number) {
    const points: Vector3[] = [];
    let n = 0;
    let lastPoint = null;

    for (let index = from; index <= to && index < ride.legs.length; index++) {
        const leg = ride.legs[index] as MovingLeg;
        if (leg.stationary) { continue };

        leg.links.forEach(link => {
            legLink_Iter(link, (point: PathPoint) => {
                const coords = projectCoordsToMapVec3(point.coordinates)
                coords.setY(n * FUTURE_Z_STEP) // TODO, proper timing
                n++

                if (lastPoint === null) {
                    //First run only
                    lastPoint = coords;
                    return
                }

                //Always push the two points of a line segment
                points.push(lastPoint)
                points.push(coords)

                lastPoint = coords;
            })
        })

    }


    const geometry = new BufferGeometry().setFromPoints(points)
    const material = new LineBasicMaterial({ opacity: 0.5, color: timelineColor })

    const mesh = new LineSegments(geometry, material)
    return mesh
}

const stationScale = 0.001
const stationRadius = 1
const stationHeight = 100;

const stationGeometry = new CylinderBufferGeometry(stationRadius, stationRadius, stationHeight, 6, 1, false).scale(stationScale, stationScale, stationScale);
const stationMaterial = new MeshBasicMaterial({ color: stationColor });

function appendRidePointsAll(startTime: number, ride: Ride, points: Vector3[]) {
    const futureRidePositions: Vector3[] = [];

    for (let i = 0; i < FUTURE_ITERATIONS; i++) {
        const time = startTime + (i * FUTURE_STEP_SECONDS * 1000);

        if (!isActiveAtTime(ride, time)) {
            break;
        }

        const trackpos = trainPosition(ride, time)
        const posRot = realPosition(trackpos);
        const pos = projectCoordsToMapVec3(posRot.position).setY(i * FUTURE_Z_STEP);

        futureRidePositions.push(pos);

        // Stop adding points if we're past the ride's end time
        if (time > ride.endTime) break;
    }

    // `futureRidePostions` is a list of points, here we take each pair and output the two vertices a line segment requires
    for (let index = 1; index < futureRidePositions.length; index++) { // Note start at 1
        points.push(futureRidePositions[index - 1]);
        points.push(futureRidePositions[index]);
    }
}

function createStationMesh(data: StaticData): { stationMesh: THREE.Object3D, stationMeshMap: ESMap<THREE.Object3D, Station> } {
    const allStations = new Object3D();
    const map = new Map();

    for (const station of data.stationMap.values()) {
        const mesh = new Mesh(stationGeometry, stationMaterial)
        mesh.position.add(projectCoordsToMapVec3(station.position))
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

function geometryFromGeoJson(map_geo: any): BufferGeometry {
    assertEq(map_geo.type, "FeatureCollection")

    const shapes = []


    map_geo.features.forEach(feature => {
        assertEq(feature.type, "Feature")

        feature.geometry.coordinates.forEach(geo => {

            geo.forEach(polygon => {
                const shape = new Shape();
                for (let index = 0; index < polygon.length; index++) {
                    const [longitude, latitude] = polygon[index];
                    const [x, y] = projectCoordsToMap({ latitude, longitude })

                    if (index == 0) {
                        shape.moveTo(x, y)
                    } else {
                        shape.lineTo(x, y)
                    }

                }
                shapes.push(shape)
            })


        })
    })

    return new ShapeBufferGeometry(shapes)
}

