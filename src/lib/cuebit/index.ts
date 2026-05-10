import cv from "@techstark/opencv-js";
import type { InferenceSession } from "onnxruntime-web";
import * as ort from "onnxruntime-web/webgpu";
import { alignTo16, measure, snapshotMat, withMatScope } from "@/common";
import type { ONNX } from "@/lib/onnx";
import type { Point } from "@/types/physics";
import type { FrameInfo } from "../capture";
import hwc2chwShader from "./shaders/hwc2chw.wgsl";
import maskShader from "./shaders/mask.wgsl";
import resizeShader from "./shaders/resize.wgsl";

/**
 * 버퍼 인덱스
 */
export type BufferIndex = 0 | 1;

/**
 * 한 프레임 추론에 필요한 버퍼 세트
 */
interface BufferSet {
	readonly resizePipeline: GPUComputePipeline;
	readonly preprocessPipeline: GPUComputePipeline;
	/**
	 * 프레임을 복사할 텍스처
	 */
	readonly frameTexture: GPUTexture;
	/**
	 * 리사이즈된 프레임 텍스쳐
	 */
	readonly resizedFrameTexture: GPUTexture;
	/**
	 * 리사이즈된 프레임을 저장할 텍스처
	 */
	readonly resizeBindGroup: GPUBindGroup;
	/**
	 * 셰이더에서 프레임 데이터를 읽어올 때 사용하는 바인드 그룹
	 */
	readonly preprocessBindGroup: GPUBindGroup;
	/**
	 * 셰이더에서 프레임 데이터를 읽어올 버퍼
	 */
	readonly inputBuffer: GPUBuffer;
	/**
	 * ONNX Runtime에서 GPU 버퍼를 텐서로 사용할 때 필요한 래퍼 객체
	 */
	readonly inputTensor: ort.Tensor;
	/**
	 * 모델의 첫 번째 출력 버퍼
	 */
	readonly detectionsBuffer: GPUBuffer;
	/**
	 * 모델의 첫 번째 출력 텐서
	 */
	readonly detectionsTensor: ort.Tensor;
	/**
	 * 모델의 두 번째 출력 버퍼
	 */
	readonly protosBuffer: GPUBuffer;
	/**
	 * 모델의 두 번째 출력 텐서
	 */
	readonly protosTensor: ort.Tensor;
	/**
	 * output0를 CPU에 전달하기 위한 staging 버퍼
	 */
	readonly detectionsReadBuffer: GPUBuffer;
	/**
	 * 현재 버퍼에 대해 진행 중인 추론 결과를 나타내는 Promise
	 */
	pendingSegmentationInference: Promise<InferenceSession.OnnxValueMapType> | null;

	readonly maskPipeline: GPUComputePipeline;
	/**
	 * 마스크 생성 셰이더에서 사용할 바인드 그룹
	 */
	readonly maskBindgroup: GPUBindGroup;
	/**
	 * 마스크 생성 셰이더에서 사용할 Params 버퍼
	 */
	readonly maskParamsBuffer: GPUBuffer;
	/**
	 * 마스크 이미지를 저장하는 버퍼
	 */
	readonly maskBuffer: GPUBuffer;
	/**
	 * 마스크 이미지를 CPU에 전달하기 위한 staging 버퍼:
	 */
	readonly maskReadBuffer: GPUBuffer;
}

interface DetectionMaskIndex {
	readonly detection: Detection;
	readonly index: number;
}

interface Postprocess {
	tableMask: MaskResult | null;
	balls: Point[];
}

class MaskParams {
	public readonly table: DetectionMaskIndex | null;

	constructor(table: Detection | null) {
		const maskIndices: Detection[] = [];

		this.table = table && {
			detection: table,
			index: maskIndices.length,
		};
	}

	public toByteLayout(): Uint32Array {
		const indices: number[] = [];

		if (this.table) {
			indices.push(this.table.detection.index);
		}

		return new Uint32Array([indices.length, ...indices]);
	}
}

interface MaskResult {
	readonly masks: Float32Array[];
	readonly params: MaskParams;
}

interface Quad {
	readonly points: {
		readonly topLeft: Point;
		readonly bottomLeft: Point;
		readonly bottomRight: Point;
		readonly topRight: Point;
	};
}

function dist(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function toQuad(points: [Point, Point, Point, Point]): Quad {
	const indexedPoints = points.map((point, index) => ({
		point,
		index,
	}));

	const leftmost = indexedPoints.reduce((acc, cur) =>
		acc.point.x < cur.point.x ? acc : cur,
	);
	const rightmost = indexedPoints[(leftmost.index + 2) % 4];

	const topmost = indexedPoints.reduce((acc, cur) =>
		acc.point.y < cur.point.y ? acc : cur,
	);
	const bottommost = indexedPoints[(topmost.index + 2) % 4];

	if (
		dist(leftmost.point, topmost.point) > dist(leftmost.point, bottommost.point)
	) {
		return {
			points: {
				topLeft: bottommost.point,
				bottomLeft: leftmost.point,
				bottomRight: topmost.point,
				topRight: rightmost.point,
			},
		};
	}

	return {
		points: {
			topLeft: leftmost.point,
			bottomLeft: topmost.point,
			bottomRight: rightmost.point,
			topRight: bottommost.point,
		},
	};
}

function getTransformMatrix(quad: Quad) {
	return withMatScope((track) => {
		const src = track(
			cv.matFromArray(4, 1, cv.CV_32FC2, [
				quad.points.topLeft.x ?? 0,
				quad.points.topLeft.y ?? 0,
				quad.points.bottomLeft.x ?? 0,
				quad.points.bottomLeft.y ?? 0,
				quad.points.bottomRight.x ?? 0,
				quad.points.bottomRight.y ?? 0,
				quad.points.topRight.x ?? 0,
				quad.points.topRight.y ?? 0,
			]),
		);
		const dst = track(
			cv.matFromArray(
				4,
				1,
				cv.CV_32FC2,
				[
					// Top-Left
					0, 1422,
					// Bottom-Left
					0, 0,
					// Bottom-Right
					2844, 0,
					// Top-Right
					2844, 1422,
				],
			),
		);
		const transform = track(cv.getPerspectiveTransform(src, dst));
		const inverseTransform = track(transform.inv(cv.DECOMP_LU));

		return {
			transform: snapshotMat(transform),
			inverseTransform: snapshotMat(inverseTransform),
		};
	});
}

/**
 *
 */
function splitFloat32Array(
	array: Float32Array,
	chunkSize: number,
): Float32Array[] {
	const chunks: Float32Array[] = [];

	for (let i = 0; i < array.length; i += chunkSize) {
		chunks.push(array.subarray(i, i + chunkSize));
	}

	return chunks;
}

function findLargestQuad(
	mask: Float32Array,
	width: number,
	height: number,
): [Point, Point, Point, Point] | null {
	const result = withMatScope((track) => {
		// Float32 → 0/255 binary Mat
		const src = track(new cv.Mat(height, width, cv.CV_8UC1));
		for (let i = 0; i < width * height; i++) {
			src.data[i] = mask[i] > 0.5 ? 255 : 0;
		}

		const contours = track(new cv.MatVector());
		const hierarchy = track(new cv.Mat());
		cv.findContours(
			src,
			contours,
			hierarchy,
			cv.RETR_EXTERNAL,
			cv.CHAIN_APPROX_SIMPLE,
		);

		// 면적 가장 큰 컨투어
		let maxArea = 0;
		let maxIdx = -1;
		for (let i = 0; i < contours.size(); i++) {
			const area = cv.contourArea(contours.get(i));
			if (area > maxArea) {
				maxArea = area;
				maxIdx = i;
			}
		}

		let result: Point[] | null = null;
		if (maxIdx >= 0) {
			const cnt = contours.get(maxIdx);
			const approx = track(new cv.Mat());
			const peri = cv.arcLength(cnt, true);
			cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

			if (approx.rows === 4) {
				result = [];
				for (let i = 0; i < 4; i++) {
					result.push({
						x: approx.data32S[i * 2],
						y: approx.data32S[i * 2 + 1],
					});
				}
			} else {
				// 4점이 아닐 땐 최소 외접 회전 사각형으로 폴백
				const rect = cv.minAreaRect(cnt);
				const box = cv.boxPoints(rect);

				result = box.map((p) => ({ x: p.x, y: p.y }));
			}
		}

		return result;
	});

	return result ? [result[0], result[1], result[2], result[3]] : null;
}

class Detection {
	public readonly index: number;
	public readonly lt: Point;
	public readonly rb: Point;
	public readonly confidence: number;
	public readonly classId: number;
	public readonly coefficients: Float32Array;

	constructor(index: number, chunk: Float32Array) {
		this.index = index;
		this.lt = {
			x: chunk[0],
			y: chunk[1],
		};
		this.rb = {
			x: chunk[2],
			y: chunk[3],
		};
		this.confidence = chunk[4];
		this.classId = chunk[5];
		this.coefficients = chunk.subarray(6);
	}
}

function toDetections(detection: Float32Array, chunkSize: number): Detection[] {
	const detections: Detection[] = [];

	for (let i = 0; i < detection.length; i += chunkSize) {
		detections.push(new Detection(i, detection.subarray(i, i + chunkSize)));
	}

	return detections;
}

/**
 * 전체 파이프라인 실행 클래스
 */
class Cuebit {
	private device: GPUDevice;
	private onnx: ONNX;
	private frameInfo: FrameInfo;
	private preprocessShaderModule: GPUShaderModule;
	private maskShaderModule: GPUShaderModule;
	private buffers: [BufferSet, BufferSet];
	private currentBufferIndex: BufferIndex = 0;

	constructor(device: GPUDevice, onnx: ONNX, frameInfo: FrameInfo) {
		this.device = device;
		this.onnx = onnx;
		this.frameInfo = frameInfo;
		this.preprocessShaderModule = device.createShaderModule({
			code: hwc2chwShader,
		});
		this.maskShaderModule = device.createShaderModule({
			code: maskShader,
		});

		this.buffers = [
			this.createBufferSet(frameInfo, onnx),
			this.createBufferSet(frameInfo, onnx),
		];
	}

	private createBufferSet(frameInfo: FrameInfo, onnx: ONNX): BufferSet {
		const resizePipeline = this.device.createComputePipeline({
			layout: "auto",
			compute: {
				module: this.device.createShaderModule({
					code: resizeShader,
				}),
				entryPoint: "resize",
			},
		});
		const preprocessPipeline = this.device.createComputePipeline({
			layout: "auto",
			compute: {
				module: this.preprocessShaderModule,
				entryPoint: "hwc2chw",
			},
		});
		const frameTexture = this.device.createTexture({
			size: [frameInfo.width, frameInfo.height],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.COPY_SRC |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});

		const resizedFrameTexture = this.device.createTexture({
			size: [
				onnx.segementation.input.feeds.image.width,
				onnx.segementation.input.feeds.image.height,
			],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.COPY_SRC |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.STORAGE_BINDING,
		});

		const sampler = this.device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
		});

		const resizeParamsBuffer = this.device.createBuffer({
			label: "Resize Params Buffer",
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			size: alignTo16(4 * 4), // width, height, srcWidth, srcHeight
		});
		this.device.queue.writeBuffer(
			resizeParamsBuffer,
			0,
			new Uint32Array([
				frameInfo.width,
				frameInfo.height,
				onnx.segementation.input.feeds.image.width,
				onnx.segementation.input.feeds.image.height,
			]),
		);

		const resizeBindGroup = this.device.createBindGroup({
			layout: resizePipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: frameTexture.createView(),
				},
				{
					binding: 1,
					resource: resizedFrameTexture.createView(),
				},
				{
					binding: 2,
					resource: {
						buffer: resizeParamsBuffer,
					},
				},
				{
					binding: 3,
					resource: sampler,
				},
			],
		});

		const inputBuffer = this.device.createBuffer({
			label: "Input Buffer",
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			// 4 byte * 3 channel * width * height
			size: alignTo16(4 * onnx.segementation.input.feeds.image.size),
		});

		const inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer, {
			dataType: "float32",
			dims: onnx.segementation.input.feeds.image.shape,
		});

		const preprocessBindGroup = this.device.createBindGroup({
			layout: preprocessPipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: resizedFrameTexture.createView(),
				},
				{
					binding: 1,
					resource: {
						buffer: inputBuffer,
					},
				},
			],
		});

		const detectionsBuffer = this.device.createBuffer({
			label: "Detections Buffer",
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16(4 * onnx.segementation.output.fetchs.detections.size),
		});
		const detectionsTensor = ort.Tensor.fromGpuBuffer(detectionsBuffer, {
			dataType: "float32",
			dims: onnx.segementation.output.fetchs.detections.shape,
		});

		const protosBuffer = this.device.createBuffer({
			label: "Protos Buffer",
			usage:
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST |
				GPUBufferUsage.STORAGE,
			size: alignTo16(4 * onnx.segementation.output.fetchs.protos.size),
		});
		const protosTensor = ort.Tensor.fromGpuBuffer(protosBuffer, {
			dataType: "float32",
			dims: onnx.segementation.output.fetchs.protos.shape,
		});
		const detectionsReadBuffer = this.device.createBuffer({
			label: "Detections Read Buffer",
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			size: detectionsBuffer.size,
		});

		// mask
		const maskPipeline = this.device.createComputePipeline({
			layout: "auto",
			compute: {
				module: this.maskShaderModule,
				entryPoint: "createMask",
			},
		});
		const maskParamsBuffer = this.device.createBuffer({
			label: "Mask Params Buffer",
			// candidateCount(1) + candidates(31)
			size: alignTo16(4 * 32),
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		const maskBuffer = this.device.createBuffer({
			label: "Mask Buffer",
			usage:
				GPUBufferUsage.STORAGE |
				GPUBufferUsage.COPY_SRC |
				GPUBufferUsage.COPY_DST,
			size: alignTo16(
				4 *
					10 *
					onnx.segementation.output.fetchs.protos.width *
					onnx.segementation.output.fetchs.protos.height,
			),
		});
		const maskBindgroup = this.device.createBindGroup({
			layout: maskPipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: {
						buffer: detectionsBuffer,
					},
				},
				{
					binding: 1,
					resource: {
						buffer: protosBuffer,
					},
				},
				{
					binding: 2,
					resource: {
						buffer: maskParamsBuffer,
					},
				},
				{
					binding: 3,
					resource: {
						buffer: maskBuffer,
					},
				},
			],
		});
		const maskReadBuffer = this.device.createBuffer({
			label: "Mask Read Buffer",
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			size: maskBuffer.size,
		});

		return {
			resizePipeline,
			preprocessPipeline,
			frameTexture,
			resizedFrameTexture,
			resizeBindGroup,
			preprocessBindGroup,
			inputBuffer,
			inputTensor,
			detectionsBuffer,
			detectionsTensor,
			protosBuffer,
			protosTensor,
			detectionsReadBuffer,
			pendingSegmentationInference: null,
			maskPipeline,
			maskBindgroup,
			maskParamsBuffer,
			maskBuffer,
			maskReadBuffer,
		};
	}

	/**
	 * 프레임 전처리
	 */
	private preprocessFrame(frame: VideoFrame, buffer: BufferSet): void {
		// 프레임을 텍스처로 복사
		this.copyFrameToTexture(frame, buffer);

		// 프레임 전처리
		const commandEncoder = this.device.createCommandEncoder();
		this.resize(commandEncoder, buffer);
		this.hwc2chw(commandEncoder, buffer);
		this.device.queue.submit([commandEncoder.finish()]);
	}

	private copyFrameToTexture(frame: VideoFrame, buffer: BufferSet): void {
		// NOTE: importExternalTexture 고려
		this.device.queue.copyExternalImageToTexture(
			{
				source: frame,
			},
			{
				texture: buffer.frameTexture,
			},
			[this.frameInfo.width, this.frameInfo.height],
		);
	}

	private resize(encoder: GPUCommandEncoder, buffer: BufferSet): void {
		const pass = encoder.beginComputePass();
		pass.setPipeline(buffer.resizePipeline);
		pass.setBindGroup(0, buffer.resizeBindGroup);
		pass.dispatchWorkgroups(
			alignTo16(this.onnx.segementation.input.feeds.image.width),
			alignTo16(this.onnx.segementation.input.feeds.image.height),
		);
		pass.end();
	}

	private hwc2chw(encoder: GPUCommandEncoder, buffer: BufferSet): void {
		const pass = encoder.beginComputePass();
		pass.setPipeline(buffer.preprocessPipeline);
		pass.setBindGroup(0, buffer.preprocessBindGroup);
		pass.dispatchWorkgroups(
			alignTo16(this.onnx.segementation.input.feeds.image.width),
			alignTo16(this.onnx.segementation.input.feeds.image.height),
		);
		pass.end();
	}

	private select(detections: Detection[]): [Detection | null, Detection[]] {
		let table: Detection | null = null;
		const balls: Detection[] = [];
		const ballClassIds = new Set([0, 1, 3, 4]);

		for (const detection of detections) {
			if (detection.classId === 2) {
				// NOTE: 2: table
				if (table === null || detection.confidence > table.confidence) {
					table = detection;
				}
			} else if (ballClassIds.has(detection.classId)) {
				// NOTE: 0,1,3,4: balls
				if (detection.confidence > 0.25) {
					balls.push(detection);
				}
			}
		}

		return [table, balls];
	}

	private async postprocess(buffer: BufferSet): Promise<Postprocess | null> {
		// buffer의 프레임 추론 결과 대기
		if (buffer.pendingSegmentationInference == null) {
			return null;
		}
		await measure(
			() => buffer.pendingSegmentationInference,
			"Pending Inference",
		);

		// buffer의 추론 결과를 staging 버퍼로 복사
		const stagingCommandEncoder = this.device.createCommandEncoder();
		stagingCommandEncoder.copyBufferToBuffer(
			buffer.detectionsBuffer,
			0,
			buffer.detectionsReadBuffer,
			0,
			buffer.detectionsReadBuffer.size,
		);
		this.device.queue.submit([stagingCommandEncoder.finish()]);

		await buffer.detectionsReadBuffer.mapAsync(GPUMapMode.READ);
		const detections = toDetections(
			new Float32Array(buffer.detectionsReadBuffer.getMappedRange().slice(0)),
			this.onnx.segementation.output.fetchs.detections.stride,
		);
		buffer.detectionsReadBuffer.unmap();

		// 추론 결과에서 테이블과 공 선택
		const [table, balls] = this.select(detections);

		// 테이블을 위한 마스크 파라미터 생성
		const params = new MaskParams(table);

		//
		this.device.queue.writeBuffer(
			buffer.maskParamsBuffer,
			0,
			params.toByteLayout(),
		);

		const commandEncoder = this.device.createCommandEncoder();
		const maskPass = commandEncoder.beginComputePass();
		maskPass.setPipeline(buffer.maskPipeline);
		maskPass.setBindGroup(0, buffer.maskBindgroup);
		maskPass.dispatchWorkgroups(
			Math.ceil(this.onnx.segementation.output.fetchs.protos.width / 16),
			Math.ceil(this.onnx.segementation.output.fetchs.protos.height / 16),
		);
		maskPass.end();
		this.device.queue.submit([commandEncoder.finish()]);

		// TODO: maskCommandEncoder와 stagingCommandEncoder를 하나의 커맨드 인코더로 합쳐서 해도 될듯
		const maskStagingCommandEncoder = this.device.createCommandEncoder();
		maskStagingCommandEncoder.copyBufferToBuffer(
			buffer.maskBuffer,
			0,
			buffer.maskReadBuffer,
			0,
			// 4 byte * 10개 detection * width * height
			4 *
				10 *
				this.onnx.segementation.output.fetchs.protos.width *
				this.onnx.segementation.output.fetchs.protos.height,
		);
		this.device.queue.submit([maskStagingCommandEncoder.finish()]);

		await buffer.maskReadBuffer.mapAsync(GPUMapMode.READ);

		const masks = splitFloat32Array(
			new Float32Array(buffer.maskReadBuffer.getMappedRange().slice(0)),
			this.onnx.segementation.output.fetchs.protos.width *
				this.onnx.segementation.output.fetchs.protos.height,
		);
		buffer.maskReadBuffer.unmap();

		return {
			tableMask: {
				masks,
				params,
			},
			balls: balls.map((ball) => ({
				x: (ball.lt.x + ball.rb.x) / 2,
				y: (ball.lt.y + ball.rb.y) / 2,
			})),
		};
	}

	/**
	 *
	 */
	public async process(frame: VideoFrame) {
		// 이전 버퍼 인덱스 계산
		const previousBufferIndex = 1 - this.currentBufferIndex;

		// 현재 버퍼와 이전 버퍼 참조
		const [currentBuffer, previousBuffer] = [
			this.buffers[this.currentBufferIndex],
			this.buffers[previousBufferIndex],
		];

		this.preprocessFrame(frame, currentBuffer);

		const postprocessResult = await measure(
			() => this.postprocess(previousBuffer),
			"Get Mask",
		);

		// 이전 추론이 완료된 후 현재 버퍼에 대해 추론 시작
		currentBuffer.pendingSegmentationInference =
			this.onnx.segementation.session.run(
				{
					[this.onnx.segementation.input.feeds.image.name]:
						currentBuffer.inputTensor,
				},
				{
					[this.onnx.segementation.output.fetchs.detections.name]:
						currentBuffer.detectionsTensor,
					[this.onnx.segementation.output.fetchs.protos.name]:
						currentBuffer.protosTensor,
				},
			);

		const getTablePoints = () => {
			const tableMask = postprocessResult?.tableMask;

			if (!tableMask) {
				return null;
			}

			const table = tableMask?.params?.table;

			if (!table) {
				console.log("테이블 감지 실패");
				return null;
			}

			const mask = tableMask.masks[table.index];

			const quad = findLargestQuad(
				mask,
				this.onnx.segementation.output.fetchs.protos.width,
				this.onnx.segementation.output.fetchs.protos.height,
			);

			if (mask !== null && quad === null) {
				console.log("table mask로부터 quad 찾기 실패");
			}

			return quad;
		};

		const points = measure(() => getTablePoints(), "Find Largest Quad");
		const quad = points && toQuad(points);

		const table = quad
			? {
					quad,
					matrix: getTransformMatrix(quad),
				}
			: null;

		// 버퍼 인덱스 업데이트
		this.currentBufferIndex = (1 - this.currentBufferIndex) as BufferIndex;

		const scaleFactorX =
			this.onnx.segementation.output.fetchs.protos.width /
			this.onnx.segementation.input.feeds.image.width;
		const scaleFactorY =
			this.onnx.segementation.output.fetchs.protos.height /
			this.onnx.segementation.input.feeds.image.height;

		const balls =
			postprocessResult?.balls?.map((ball) => ({
				x: ball.x * scaleFactorX,
				y: ball.y * scaleFactorY,
			})) ?? [];

		return {
			table,
			balls,
		};
	}

	public getCurrentBufferIndex(): BufferIndex {
		return this.currentBufferIndex;
	}

	public getBuffer(bufferIndex: BufferIndex): BufferSet {
		return this.buffers[bufferIndex];
	}
}

export default Cuebit;
