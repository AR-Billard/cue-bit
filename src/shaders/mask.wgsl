// proto mask의 수
const NUM_PROTOS: u32 = 32u;

// proto mask의 크기
const PROTO_H: u32 = 160u;
const PROTO_W: u32 = 160u;
const PROTO_PLANE = PROTO_H * PROTO_W;

// detection 한 행에서 bbox, conf, cls를 제외한 mask coeffs가 시작되는 offset
const COEFF_OFFSET: u32 = 6u; // 4 bbox + 1 conf + 1 cls

// detection 한 행의 요소 수 (bbox + conf + cls + mask coeffs)
const ROW_STRIDE: u32 = COEFF_OFFSET + NUM_PROTOS; // 4 + 1 + 1 + 32 = 38

// 최대 detection 개수
// 테이블 + 큐 + 공 4개 = 6개
const MAX_DETECTIONS: u32 = 6u;

struct Params {
    count: u32,

};

// 300 * 38
@group(0) @binding(0) var<storage, read> detections: array<f32>;
// 32 * 160 * 160
@group(0) @binding(1) var<storage, read> protos: array<f32>;
// MAX_DETECTIONS
@group(0) @binding(2) var<storage, read> rowIndices: array<u32>;
@group(0) @binding(3) var<uniform> params: Params;
// MAX_DETECTIONS * 160 * 160
@group(0) @binding(4) var<storage, read_write> masks: array<f32>;

fn sigmoid(x: f32) -> f32 {
    return 1.0 / (1.0 + exp(-x));
}

@compute @workgroup_size(16, 16, 1)
fn createMask(@builtin(global_invocation_id) id: vec3<u32>) {
    let x = id.x;
    let y = id.y;
    let z = id.z;

    if x >= PROTO_W || y >= PROTO_H || z >= params.count {
        // 범위를 벗어나거나 detection 유효 범위를 벗어나는 경우 계산하지 않고 종료
        return;
    }

    let rowIndex = rowIndices[z];
    if rowIndex < 0u {
        // 찾을 detection의 수를 넘어간 경우 종류
        return;
    }

    let coefBase = rowIndex * ROW_STRIDE + COEFF_OFFSET;
    let pixelOffset = y * PROTO_W + x;

    var sum: f32 = 0.0;
    for (var k: u32 = 0u; k < NUM_PROTOS; k = k + 1u) {
        let coef = detections[coefBase + k];
        let protoVal = protos[k * PROTO_PLANE + pixelOffset];
        sum += coef * protoVal;
    }

    let maskIndex = z * PROTO_PLANE + pixelOffset;
    masks[maskIndex] = sigmoid(sum);
}
