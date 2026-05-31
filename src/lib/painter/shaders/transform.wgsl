@group(0) @binding(0) var<uniform> matrix : mat3x3<f32>;
@group(0) @binding(1) var source : texture_2d<f32>;
@group(0) @binding(2) var sourceSampler : sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

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

    // H * (u, v, 1) → (x', y', w'), x'/w', y'/w' 는 destination UV (0..1)
    let warped = matrix * vec3<f32>(srcUV, 1.0);

    // destination UV → NDC. w'를 그대로 살려서 perspective-correct 보간 유도
    // (GPU가 자동으로 position.xy / position.w 나눔)
    let x = warped.x * 2.0 - warped.z;
    let y = -(warped.y * 2.0 - warped.z); // Y flip

    var output: VertexOutput;
    output.position = vec4<f32>(x, y, 0.0, warped.z);
    output.texCoord = srcUV;

    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // 변환된 좌표에 맞춰 2D Canvas 텍스처에서 픽셀을 샘플링하여 출력 (후처리 완료)
    return textureSample(source, sourceSampler, in.texCoord);
}
