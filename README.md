# Cuebit

Cuebit is a React/Vite mobile AR billiards simulation project. The app detects a table, cue, and balls, converts the detected scene into meter-space table coordinates, predicts ball motion with a 2D physics engine, and renders the predicted trajectory as an AR guide.

The current app supports a development flow driven by the test panel. The production camera path has a clear connection point for future YOLO/ONNXRuntime detector output, but the detector integration itself is still TODO.

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm run test:physics
tsc --noEmit -p tsconfig.app.json
```

`npm run test:physics` runs the physics regression suite, including the current type/adapter/API/dev-input integration checks.

## Project Structure

- `src/hooks/use_camera.ts`: Starts/stops the camera, copies video frames to canvas, and exposes the production detector connection point.
- `src/lib/detection/dev_detected_state.ts`: Builds a `DetectedState` from DEV/test-panel values.
- `src/types/detection.ts`: Official external detection input contract.
- `src/types/physics.ts`: Shared meter-space point, ball position, prediction input, and physics result types.
- `src/lib/physics/detection_adapter.ts`: Converts `DetectedState` into `PredictShotInput`.
- `src/lib/physics/index.ts`: Public physics API barrel.
- `src/lib/physics/simulation_2d.ts`: 2D billiards simulation engine.
- `src/hooks/use_ar.ts`: Draws physics results on the AR/minimap canvases.
- `src/app/routes/main/index.tsx`: Connects camera/detection, physics prediction, AR rendering, and the test panel.
- `src/app/routes/main/test_panel.tsx`: DEV controls for cue, balls, power, angle, and spin.
- `scripts/physics_regression_test.ts`: Regression tests for physics behavior and integration boundaries.

## Coordinate System

All project table coordinates use meters.

- Origin: top-left corner of the billiards table
- x: increases left to right
- y: increases top to bottom
- Table size: `2.84m x 1.42m`
- Center: `{ x: 1.42, y: 0.71 }`
- Angle: `0deg = right`, `90deg = down`, `180deg = left`, `270deg = up`

Detector teams should pass homography-corrected meter coordinates, not raw pixels or 0-1000 normalized image coordinates.

```ts
const dx = target.x - cue.x;
const dy = target.y - cue.y;
const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
const normalizedAngleDeg = (angleDeg + 360) % 360;
```

## Official Data Flow

DEV test input flow:

```text
createDevDetectedState()
-> DetectedState
-> toPredictShotInput()
-> PredictShotInput
-> predictShot()
-> PhysicsResult
```

Expected production flow:

```text
Camera frame
-> YOLO/ONNX detector
-> homography/meter coordinate conversion
-> DetectedState
-> toPredictShotInput()
-> predictShot()
-> PhysicsResult
-> AR rendering
```

## DetectedState Contract

`DetectedState` is the official input contract for detection/vision integration.

```ts
interface DetectedState {
  cue: {
    angleDeg: number;
    power: number;
    hitPoint: {
      x: number;
      y: number;
    };
  };
  shot: {
    cueBallId: string;
  };
  balls: {
    id: string;
    x: number;
    y: number;
  }[];
}
```

Field rules:

- `cue.angleDeg`: shot angle in degrees using the project meter coordinate system.
- `cue.power`: shot power in the project input range, currently `0` to `3`.
- `cue.hitPoint.x`: horizontal tip offset, expected range `-1` to `1`.
- `cue.hitPoint.y`: vertical tip offset, expected range `-1` to `1`.
- `shot.cueBallId`: the detected ball id that should be treated as the cue ball for this shot.
- `balls[].x` / `balls[].y`: meter-space table coordinates.

Example:

```ts
const detectedState: DetectedState = {
  cue: {
    angleDeg: 35,
    power: 0.7,
    hitPoint: { x: 0, y: 0 },
  },
  shot: {
    cueBallId: "white",
  },
  balls: [
    { id: "white", x: 0.57, y: 1.07 },
    { id: "red", x: 1.42, y: 0.71 },
    { id: "yellow", x: 1.99, y: 0.43 },
  ],
};
```

## PredictShotInput

`PredictShotInput` is the internal physics input shape.

```ts
interface PredictShotInput {
  balls: Record<string, MeterPoint>;
  angleDeg: number;
  power: number;
  maxSteps?: number;
  sideSpin?: number;
  topSpin?: number;
}
```

Rules:

- `balls` is a `Record<string, MeterPoint>`.
- The internal cue ball id is always `"cueBall"`.
- `DetectedState.shot.cueBallId` is mapped to internal `"cueBall"` by `toPredictShotInput()`.
- If `shot.cueBallId` is not present in `balls[]`, the adapter does not synthesize an internal `"cueBall"` ball. The physics engine then returns a safe empty result because it cannot find a cue ball.
- Other ball ids are preserved.
- If a non-cue detected ball already uses id `"cueBall"`, the adapter maps it to `"detected:cueBall"` to avoid overwriting the internal cue ball.
- `DetectedState.cue` remains cue-stick information, not a ball id.
- `angleDeg` is the shot angle in degrees.
- `DetectedState.cue.angleDeg` is copied into `PredictShotInput.angleDeg` by the adapter.

## Public Physics API

Use these functions from `@/lib/physics`.

### `toPredictShotInput(detected)`

Converts a `DetectedState` into `PredictShotInput`.

Use this when a detector already produced a `DetectedState`, but the caller still wants to inspect or cache the physics input before simulation.

```ts
const input = toPredictShotInput(detectedState);
```

### `predictShot(input)`

Runs the physics engine from a `PredictShotInput`.

Use this as the main physics call when input is already in internal physics format.

```ts
const result = predictShot({
  balls: {
    cueBall: { x: 0.57, y: 1.07 },
    red: { x: 1.42, y: 0.71 },
  },
  angleDeg: 45,
  power: 1.2,
});
```

### `predictDetectedState(detected)`

Convenience API for the full detected-input path.

Internally:

```text
DetectedState -> toPredictShotInput() -> predictShot()
```

Use this when the caller has a `DetectedState` and only needs the final `PhysicsResult`.

### `getPhysicsResult(input)`

Compatibility helper that accepts either `PredictShotInput` or `DetectedState`.

New code should prefer `predictShot()` for physics input and `predictDetectedState()` for detection input. Keep `getPhysicsResult()` for compatibility or simple call sites.

The public result is organized for integration code:

```ts
const result = getPhysicsResult(detectedState);

result.balls.cueBall.start; // starting meter position
result.balls.cueBall.end; // final meter position
result.collisions; // ball-collision and cushion-hit points
result.summary.firstHitBallId; // first object ball hit by cueBall
```

Example shape:

```ts
{
  balls: {
    cueBall: {
      start: { x: 0.57, y: 1.07 },
      end: { x: 1.1, y: 0.9 },
    },
    red: {
      start: { x: 1.42, y: 0.71 },
      end: { x: 1.8, y: 0.7 },
    },
  },
  collisions: [
    {
      type: "ball-collision",
      position: { x: 1.2, y: 0.8 },
      ballId: "cueBall",
      otherBallId: "red",
    },
    {
      type: "cushion-hit",
      position: { x: 2.81, y: 0.9 },
      ballId: "red",
      cushionSide: "right",
    },
  ],
  summary: {
    firstHitBallId: "red",
    firstCushionSide: "right",
    finalPositions: {
      cueBall: { x: 1.1, y: 0.9 },
      red: { x: 1.8, y: 0.7 },
    },
  },
}
```

Detailed `trajectories` and `events` are still kept on the result for `getImage(result)` and advanced debugging, but most callers should use `balls`, `collisions`, and `summary`.

### `getImage(result)`

Creates a browser data URL image from the physics result. By default this image
is the same kind of large AR overlay shown on the main screen: transparent
background, glowing dashed trajectory lines only, no minimap border, and no ball
start dots.

```ts
const result = getPhysicsResult(detectedState);
const image = getImage(result, {
  width: 2048,
  height: 1024,
});
```

Use the returned string directly in an image tag:

```tsx
<img src={image} alt="Expected trajectory" />
```

If a debug/minimap-style image is needed, turn the extras on explicitly:

```ts
const debugImage = getImage(result, {
  drawTableBounds: true,
  drawBallStarts: true,
  background: "#101010",
});
```

### `predictFinalPositions(input)`

Runs prediction and returns only final ball positions.

Use this when rendering trajectories/events is not needed.

```ts
const finalPositions = predictFinalPositions({
  balls: {
    cueBall: { x: 0.57, y: 1.07 },
    red: { x: 1.42, y: 0.71 },
  },
  angleDeg: 45,
  power: 1.2,
});
```

## DEV Input Helper

`createDevDetectedState(devInput)` lives in `src/lib/detection/dev_detected_state.ts`.

It converts test-panel style values into the official `DetectedState` contract.

```ts
const detected = createDevDetectedState({
  balls,
  angleDeg,
  power,
  sideSpin,
  topSpin,
  cueBallId: "cueBall",
});
```

This helper owns the DEV object creation that used to live directly inside `use_camera.ts`. `use_camera.ts` now focuses on camera/frame lifecycle and calls this helper only in development mode.

## Current Scope and Limitations

- Current AR rendering is closer to drawing meter coordinates into a screen-space table viewport.
- Current AR rendering is not yet an exact camera-image homography projection.
- Accurate overlay on the real camera image still needs a dedicated homography/projection layer.
- Production YOLO/ONNXRuntime detector integration is TODO.
- Production detector code should treat a missing `shot.cueBallId` ball as a detection miss: skip prediction for that frame or log a warning instead of relying on an empty physics result.
- Masse and other complex 3D/spin-heavy shots are out of scope.
- Jump shots and z-axis physics are out of scope.
- Practical tuning should focus on measured values for `rollingFriction`, `cushionRestitution`, `ballRestitution`, and `impulseScale`.
- The current spin model is an approximate 2D guide model, not a full real-world billiards physics model.

See `docs/physics_status.md` for the current physics implementation status.

## Integration TODO

- Connect production YOLO/ONNXRuntime detector output.
- Convert camera detections into meter coordinates through homography.
- Separate a real AR projection layer from the current table-viewport renderer.
- Tune physics constants from measured table data.
- Add regression cases for production detector edge cases.
- Keep detector and public physics angle fields aligned on `angleDeg`.
