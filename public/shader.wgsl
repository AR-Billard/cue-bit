@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let x = id.x;
    let y = id.y;
    if x >= 640u || y >= 640u { return; }

    let pixel = textureLoad(inputTex, vec2u(x, y), 0);
    let idx = y * 640u + x;
    let plane = 640u * 640u;

    output[idx] = pixel.r;  // 이미 0~1 범위 (rgba8unorm)
    output[idx + plane] = pixel.g;
    output[idx + 2u * plane] = pixel.b;
}
