@group(0) @binding(0) var<uniform> matrix : mat3x3<f32>;
@group(0) @binding(1) var source : texture_2d<f32>;
@group(0) @binding(2) var sourceSampler : sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    // perspective-correct 보간을 위해 uv/w 와 1/w 를 나눠서 전달
    @location(0) uvOverW: vec2<f32>,
    @location(1) invW: f32,
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

    // world 좌표계로 변환
    let warped = matrix * vec3<f32>(canvasPx, 1.0);

    let w = warped.z;

    // feed 좌표계로 변환
    let feed = vec2<f32>(warped.x / w, warped.y / w);

    // ndc 좌표계로 변환
    let ndc = vec2<f32>(feed.x / DEST_SIZE.x * 2.0 - 1.0, -(feed.y / DEST_SIZE.y * 2.0 - 1.0));

    var output: VertexOutput;
    output.position = vec4<f32>(ndc, 0.0, 1.0);
    // perspective-correct 보간: fragment 에서 uvOverW / invW 로 복원
    output.uvOverW = srcUV / w;
    output.invW = 1.0 / w;

    return output;
}

const SS_N= 4;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {

    // perspective-correct uv 복원
    let texCoord = in.uvOverW / in.invW;

    let dx = dpdx(texCoord);
    let dy = dpdy(texCoord);

    var acc = vec4<f32>(0.0);
    for (var i = 0; i < SS_N; i = i + 1) {
        for (var j = 0; j < SS_N; j = j + 1) {
            let offset = (vec2<f32>(f32(i), f32(j)) + 0.5) / f32(SS_N) - 0.5;
            let uv = texCoord + dx * offset.x + dy * offset.y;
            acc = acc + textureSample(source, sourceSampler, uv);
        }
    }
    return acc / f32(SS_N * SS_N);
}
