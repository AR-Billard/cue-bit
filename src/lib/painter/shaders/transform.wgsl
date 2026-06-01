@group(0) @binding(0) var<uniform> matrix : mat3x3<f32>;
@group(0) @binding(1) var source : texture_2d<f32>;
@group(0) @binding(2) var sourceSampler : sampler;
@group(0) @binding(3) var<uniform> textureSizes : TextureSizes;

struct TextureSizes {
    source: vec2<f32>,
    destination: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var uv = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
    );
    let srcUV = uv[vertexIndex];
    let canvasPx = srcUV * textureSizes.source;
    let warped = matrix * vec3<f32>(canvasPx, 1.0);
    let ndcX = warped.x / textureSizes.destination.x * 2.0 - warped.z;
    let ndcY = -(warped.y / textureSizes.destination.y * 2.0 - warped.z);

    var output: VertexOutput;
    output.position = vec4<f32>(ndcX, ndcY, 0.0, warped.z);
    output.texCoord = srcUV;
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(source, sourceSampler, in.texCoord);
}
