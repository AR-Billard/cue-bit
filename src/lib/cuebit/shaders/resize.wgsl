struct Params {
    sourceWidth: u32,
    sourceHeight: u32,
    outputWidth: u32,
    outputHeight: u32,
};

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var output: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var sourceSampler: sampler;

@compute @workgroup_size(16, 16)
fn resize(@builtin(global_invocation_id) id: vec3u) {
    let x = id.x;
    let y = id.y;

    if x >= params.outputWidth || y >= params.outputHeight {
        return;
    }

    // 비율 계산
    // REVIEW: Params에 포함해도 될듯
    let scale = min(
        f32(params.outputWidth) / f32(params.sourceWidth),
        f32(params.outputHeight) / f32(params.sourceHeight),
    );

    // 스케일링된 이미지 크기
    let scaledW = f32(params.sourceWidth) * scale;
    let scaledH = f32(params.sourceHeight) * scale;
    // 오프셋
    let offsetX = (f32(params.outputWidth) - scaledW) * 0.5;
    let offsetY = (f32(params.outputHeight) - scaledH) * 0.5;

    let fx = f32(x);
    let fy = f32(y);

    // 패딩 영역이면 YOLO 표준 패딩색 (114/255)
    if fx < offsetX || fx >= offsetX + scaledW || fy < offsetY || fy >= offsetY + scaledH {
        textureStore(output, vec2i(i32(x), i32(y)), vec4f(0.447, 0.447, 0.447, 1.0));
        return;
    }

    // output 좌표 → source 좌표 (bilinear interpolation)
    let srcX = ((fx - offsetX) + 0.5) / scale - 0.5;
    let srcY = ((fy - offsetY) + 0.5) / scale - 0.5;

    let uv = vec2f(srcX / f32(params.sourceWidth), srcY / f32(params.sourceHeight));
    let color = textureSampleLevel(source, sourceSampler, uv, 0.0);

    textureStore(output, vec2i(i32(x), i32(y)), color);
}
