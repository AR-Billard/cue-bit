@group(0) @binding(0) var<uniform> matrix : mat3x3<f32>;
@group(0) @binding(1) var source : texture_2d<f32>;
@group(0) @binding(2) var sourceSampler : sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

// TODO: uniform으로 전달
const SOURCE_SIZE = vec2<f32>(2844.0, 1422.0); // trajectoryDrawerCanvas
const DEST_SIZE   = vec2<f32>(160.0, 160.0); // overlay (feed 좌표계)

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var uv = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
    );
    let srcUV = uv[vertexIndex];

    // source 좌표계로 변환
    let canvasPx = srcUV * SOURCE_SIZE;

    // feed 좌표계로 변환
    let warped = matrix * vec3<f32>(canvasPx, 1.0);

    // 
    let ndcX = warped.x / DEST_SIZE.x * 2.0 - warped.z;
    let ndcY = -(warped.y / DEST_SIZE.y * 2.0 - warped.z); // Y flip

    var output: VertexOutput;
    output.position = vec4<f32>(ndcX, ndcY, 0.0, warped.z);
    output.texCoord = srcUV;

    return output;
}

const SS_N = 4;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // let s = textureSample(source, sourceSampler, in.texCoord);
    // return s;

    let dx = dpdx(in.texCoord);
    let dy = dpdy(in.texCoord);

    var acc = vec4<f32>(0.0);
    for (var i = 0; i < SS_N; i = i + 1) {
        for (var j = 0; j < SS_N; j = j + 1) {
            let offset = (vec2<f32>(f32(i), f32(j)) + 0.5) / f32(SS_N) - 0.5;
            let uv = in.texCoord + dx * offset.x + dy * offset.y;
            acc = acc + textureSample(source, sourceSampler, uv);
        }
    }
    return acc / f32(SS_N * SS_N);
}
