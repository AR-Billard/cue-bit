// YOLOv8/v11 segmentation mask generator
//
// detections: [1, 300, 38] = 300 rows x (4 bbox + 1 conf + 1 cls + 32 mask coeffs)
// protos:     [1, 32, 160, 160] = 32 prototype masks
// rowIndices: 선택된 detection row index 배열 (최대 10개)
// params.count: 실제 유효한 row 개수
//
// 각 선택된 detection에 대해 mask = sigmoid(sum_k(coef_k * proto_k)) 를 계산하여
// masks[d, y, x] 에 저장한다.

// proto mask의 수
const NUM_PROTOS: u32 = 32u;
// proto mask의 크기
const PROTO_H: u32 = 160u;
const PROTO_W: u32 = 160u;
// detection 한 행에서 bbox, conf, cls를 제외한 mask coeffs가 시작되는 offset
const COEFF_OFFSET: u32 = 6u; // 4 bbox + 1 conf + 1 cls
// detection 한 행의 요소 수 (bbox + conf + cls + mask coeffs)
const ROW_STRIDE: u32 = COEFF_OFFSET + NUM_PROTOS; // 4 + 1 + 1 + 32 = 38
// 최대 detection 개수
const MAX_DETECTIONS: u32 = 10u;

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
    let d = id.z;

    if x >= PROTO_W || y >= PROTO_H || d >= params.count {
        return;
    }

    let rowIndex = rowIndices[d];
    let coefBase = rowIndex * ROW_STRIDE + COEFF_OFFSET;
    let pixelOffset = y * PROTO_W + x;
    let protoPlane = PROTO_H * PROTO_W;

    var sum: f32 = 0.0;
    for (var k: u32 = 0u; k < NUM_PROTOS; k = k + 1u) {
        let coef = detections[coefBase + k];
        let protoVal = protos[k * protoPlane + pixelOffset];
        sum += coef * protoVal;
    }

    let maskIndex = d * protoPlane + pixelOffset;
    masks[maskIndex] = sigmoid(sum);
}
