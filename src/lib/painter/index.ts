export function drawTexture(
	canvasHandle: CanvasHandle<"webgpu">,
	texture: GPUTexture,
) {
	canvasHandle.draw((device, context, _width, _height) => {
		const commandEncoder = device.createCommandEncoder();
		commandEncoder.copyTextureToTexture(
			{
				texture: texture,
			},
			{
				texture: context.getCurrentTexture(),
			},
			[texture.width, texture.height],
		);
		device.queue.submit([commandEncoder.finish()]);
	});
}

export function drawTrajectory(
	canvasHandle: CanvasHandle<"2d">,
	trajectories: Trajectory[],
	scale: number = 1000,
) {
	const { draw } = canvasHandle;

	draw((context, width, height) => {
		context.clearRect(0, 0, width, height);

		if (trajectories.length === 0) {
			return;
		}

		const initialTrajactory = trajectories[0];

		context.strokeStyle = "rgba(255, 255, 255, 0.8)";
		context.lineWidth = width * 0.005;
		context.beginPath();
		context.moveTo(
			initialTrajactory.cueBall.position.x * scale,
			initialTrajactory.cueBall.position.z * scale,
		);
		for (const trajectory of trajectories) {
			const { cueBall: target } = trajectory;
			const x = target.position.x * scale;
			const y = target.position.z * scale;

			context.lineTo(x, y);
		}
		context.stroke();

		for (let i = 0; i < initialTrajactory.objectBalls.length; i++) {
			context.strokeStyle = `rgba(0, 125, 255, 1)`;
			context.lineWidth = width * 0.005;
			context.beginPath();
			context.moveTo(
				initialTrajactory.objectBalls[i].position.x * scale,
				initialTrajactory.objectBalls[i].position.z * scale,
			);
			for (const trajectory of trajectories) {
				const { objectBalls } = trajectory;
				const x = objectBalls[i].position.x * scale;
				const y = objectBalls[i].position.z * scale;

				context.lineTo(x, y);
			}
			context.stroke();
		}
	});
}

export * from "./transform";
