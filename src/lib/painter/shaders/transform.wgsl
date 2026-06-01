@group(0) @binding(0) var<uniform> matrix : mat3x3<f32>;
@group(0) @binding(1) var source : texture_2d<f32>;
@group(0) @binding(2) var sourceSampler : sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

// TODO: uniform으로 전달
const SOURCE_SIZE = vec2<f32>(2844.0, 1422.0); // trajectoryDrawerCanvas
const DEST_SIZE   = vec2<f32>(1000.0, 1000.0); // overlay (카메라 프레임)

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    // triangle-strip 4개 정점 → source UV의 네 코너
    var uv = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
    );
    let srcUV = uv[vertexIndex];

    // 1) srcUV → canvas 픽셀
    let canvasPx = srcUV * SOURCE_SIZE;

    // 2) canvas 픽셀 → 카메라 픽셀 (동차)
    let warped = matrix * vec3<f32>(canvasPx, 1.0);

    // 3) 카메라 픽셀(w 보존) → overlay UV → NDC
    //    perspective-correct 보간을 위해 w로 나누지 않고 position.w에 warped.z를 그대로 둠
    let ndcX = warped.x / DEST_SIZE.x * 2.0 - warped.z;
    let ndcY = -(warped.y / DEST_SIZE.y * 2.0 - warped.z); // Y flip

    var output: VertexOutput;
    output.position = vec4<f32>(ndcX, ndcY, 0.0, warped.z);
    output.texCoord = srcUV;

    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let s = textureSample(source, sourceSampler, in.texCoord);
    return vec4<f32>(1, 1, 0, 1) + s * 0.0;
}
