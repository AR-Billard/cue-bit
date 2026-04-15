// proto mask의 수
const NUM_PROTOS: u32 = 32u;

// proto mask의 크기
const PROTO_HEIGHT: u32 = 160u;
const PROTO_WIDTH: u32 = 160u;
const PROTO_PLANE = PROTO_HEIGHT * PROTO_WIDTH;

// detection 한 행에서 bbox, conf, cls를 제외한 mask coeffs가 시작되는 offset
const COEFF_OFFSET: u32 = 6u; // 4 bbox + 1 conf + 1 cls

// detection 한 행의 요소 수 (bbox + conf + cls + mask coeffs)
const ROW_STRIDE: u32 = COEFF_OFFSET + NUM_PROTOS; // 4 + 1 + 1 + 32 = 38

struct Params {
    candidateCount: u32,
    candidates: array<u32, 31>,
};

// 300 * 38
@group(0) @binding(0) var<storage, read> detections: array<f32>;
// 32 * 160 * 160
@group(0) @binding(1) var<storage, read> protos: array<f32>;
@group(0) @binding(2) var<storage, read> params: Params;
// MAX_DETECTIONS * 160 * 160
@group(0) @binding(3) var<storage, read_write> masks: array<f32>;

fn sigmoid(x: f32) -> f32 {
    return 1.0 / (1.0 + exp(-x));
}

@compute @workgroup_size(16, 16, 1)
fn createMask(@builtin(global_invocation_id) id: vec3<u32>) {
    let x = id.x;
    let y = id.y;
    let z = id.z;

    if x >= PROTO_WIDTH || y >= PROTO_HEIGHT || z >= params.candidateCount {
        // 범위를 벗어나거나 detection 유효 범위를 벗어나는 경우 계산하지 않고 종료
        return;
    }

    let cnadidate = params.candidates[z];

    let coefBase = cnadidate * ROW_STRIDE + COEFF_OFFSET;
    let pixelOffset = y * PROTO_WIDTH + x;

    var sum: f32 = 0.0;
    for (var k: u32 = 0u; k < NUM_PROTOS; k++) {
        let coef = detections[coefBase + k];
        let protoVal = protos[k * PROTO_PLANE + pixelOffset];
        sum += coef * protoVal;
    }

    let maskIndex = z * PROTO_PLANE + pixelOffset;
    masks[maskIndex] = sigmoid(sum);
}
