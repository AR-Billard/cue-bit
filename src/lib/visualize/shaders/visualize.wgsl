struct Uniforms {
    time: f32,       // 밀리초 단위
    width: f32,      // 캔버스 너비
    height: f32,     // 캔버스 높이
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
    // fullscreen triangle (3 vertices cover the screen)
    let x = f32(i32(vi & 1u)) * 4.0 - 1.0;
    let y = f32(i32(vi >> 1u)) * 4.0 - 1.0;

    var out: VertexOutput;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let t = uniforms.time / 1000.0; // 초 단위로 변환
    let aspect = uniforms.width / uniforms.height;
    var uv = in.uv;
    uv.x *= aspect;

    let center = vec2<f32>(aspect * 0.5, 0.5);
    let d = distance(uv, center);

    // 중심에서 퍼져나가는 링 웨이브
    let wave1 = sin(d * 20.0 - t * 3.0) * 0.5 + 0.5;
    let wave2 = sin(d * 15.0 - t * 2.0 + 1.5) * 0.5 + 0.5;

    // 거리에 따른 감쇠
    let fade = exp(-d * 2.0);

    // 시간에 따라 색상 변화
    let r = wave1 * fade * (sin(t * 0.7) * 0.5 + 0.5);
    let g = wave2 * fade * (sin(t * 1.1 + 2.0) * 0.5 + 0.5);
    let b = fade * (sin(t * 0.9 + 4.0) * 0.5 + 0.5);

    return vec4<f32>(r, g, b, 1.0);
}
