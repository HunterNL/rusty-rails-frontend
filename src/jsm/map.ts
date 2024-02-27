import { FirstPersonControls } from "../jsm/flycontrols";

import { BufferGeometry, Color, CylinderBufferGeometry, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneBufferGeometry, Raycaster, Scene, sRGBEncoding, Vector3, WebGLRenderer } from "three";
import { placeRides, Ride, StaticData, wpToArray } from "../app";
import { isActiveAtTime, trainPosition } from "../ride";
import { elapsedDaySeconds } from "../time";

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


export class TrainMap {
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    running: boolean;
    loopHandler: number;
    onTrainClick?: (r: Ride) => void
    ctrl: FirstPersonControls;

    lastFrameTimestamp: DOMHighResTimeStamp;
    staticData: StaticData;
    instanceIdToRideMap: Map<number, Ride>;
    constructor(private data: StaticData, document: Document, container: HTMLElement) {
        const scene = new Scene()
        const renderer = new WebGLRenderer({
            antialias: true
        })
        this.staticData = data

        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.outputEncoding = sRGBEncoding
        container.appendChild(renderer.domElement)

        const camera = new PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR_CLIP, FAR_CLIP)
        camera.position.fromArray([52.01495291600182, 0.15971052352701282, 4.586391092590499])
        camera.rotation.fromArray([-1.5872016132207276, -1.1026813100087973, -1.589178818372893, "XYZ"])

        // Must happen after inserting the renderer's element
        const ctrl = new FirstPersonControls(camera, renderer.domElement)

        ctrl.activeLook = true
        // ctrl.autoMove = false
        ctrl.mouseDragOn = false // No mousedragons
        ctrl.movementSpeed = CAM_SPEED
        ctrl.lookSpeed = LOOK_SPEED;

        this.ctrl = ctrl

        this.scene = scene;
        this.renderer = renderer
        this.camera = camera

        this.instanceIdToRideMap = new Map<number, Ride>();

        window.addEventListener('resize', () => this.handleResize(), { passive: true });

        this.running = false;

        this.populateScene()
    }
    populateScene() {
        const { scene, camera, data } = this

        // Sky
        scene.background = backgroundColor;

        // Ground plane

        const grassMat = new MeshBasicMaterial({ color: grassColor })
        const infiniteplane = new PlaneBufferGeometry(1000, 1000, 1)
        const grass = new Mesh(infiniteplane, grassMat)
        grass.rotateX(-Math.PI / 2)
        grass.translateZ(-0.001) // Lower slightly so the lines render above
        scene.add(grass)

        // Utrecht marker
        // const axis = new AxesHelper(.5)
        // axis.position.set(52.09, 0, 5.111)
        // scene.add(axis)

        // Helper grid
        // const help = new GridHelper(200, 64)
        // scene.add(help)

        // Transit lines
        const lineMaterial = new LineBasicMaterial({ color: lineColor, linewidth: 10, opacity: .5, transparent: true })
        const lineGeometry = new BufferGeometry()
        lineGeometry.setFromPoints(wpToArray(data.links))
        const lines = new LineSegments(lineGeometry, lineMaterial)

        scene.add(lines)

        const timeLineMesh = createTimeline(data);
        scene.add(timeLineMesh)

        const rideMesh = placeRides(data, this.instanceIdToRideMap)
        scene.add(rideMesh)


        const stationMesh = createStationMesh(this.data)
        scene.add(stationMesh);

        const raycaster = new Raycaster()



        // Development aid
        document.addEventListener("keydown", e => {
            if (e.key == " ") {
                console.log(`
            camera.position.fromArray(${JSON.stringify(camera.position.toArray())})
            camera.rotation.fromArray(${JSON.stringify(camera.rotation.toArray())})
            `)
            }
        })

        document.addEventListener("click", e => {
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = (e.clientY / window.innerHeight) * -2 + 1;

            raycaster.setFromCamera({ x, y }, camera)
            const castResult = raycaster.intersectObject(rideMesh)

            if (castResult.length > 0) {
                const instanceId = castResult[0].instanceId
                const ride = this.instanceIdToRideMap.get(instanceId)

                console.debug(ride);

                this?.onTrainClick(ride)
            }
        })
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.ctrl.handleResize()
    }

    renderOnce(dt: number) {
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
function createTimeline(data: StaticData): Line {
    const { rides, links } = data

    const startTime = elapsedDaySeconds() / 60
    const points: Vector3[] = [];

    for (let index = 0; index < rides.length; index++) {
        const ride = rides[index];

        const futureRidePositions: Vector3[] = [];

        for (let i = 0; i < FUTURE_ITERATIONS; i++) {
            const time = startTime + (i * FUTURE_STEP_SECONDS / 60)

            if (!isActiveAtTime(ride, time)) {
                break;
            }

            const posRot = trainPosition(ride, time);

            const pos = new Vector3(posRot.pos.x, i * FUTURE_Z_STEP, posRot.pos.y)

            futureRidePositions.push(pos)

            // Stop adding points if we're past the ride's end time
            if (time > ride.endTime) break;
        }

        for (let index = 1; index < futureRidePositions.length; index++) { // Note start at 1
            points.push(futureRidePositions[index - 1]);
            points.push(futureRidePositions[index]);
        }
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

function createStationMesh(data: StaticData): THREE.Object3D {
    const allStations = new Object3D();

    for (const station of data.stationMap.values()) {
        const mesh = new Mesh(stationGeometry, stationMaterial)
        mesh.position.set(station.position.lat, 0, station.position.lon)
        allStations.add(mesh)
    }

    return allStations;

}

