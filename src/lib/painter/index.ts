import hyperparams from "@/config/hyperparams";

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
	showOutline = false,
) {
	const { draw } = canvasHandle;

	draw((context, width, height) => {
		context.clearRect(0, 0, width, height);

		if (trajectories.length === 0) {
			return;
		}

		const initialTrajactory = trajectories[0];

		if (showOutline) {
			context.strokeStyle = "rgba(255, 255, 255, 1)";
			context.lineWidth = width * 0.003;
			context.beginPath();
			context.arc(
				initialTrajactory.cueBall.position.x * scale,
				initialTrajactory.cueBall.position.z * scale,
				hyperparams.ball.radius * scale,
				0,
				2 * Math.PI,
			);
			context.stroke();

			for (const ball of initialTrajactory.objectBalls) {
				context.strokeStyle = `rgba(0, 125, 255, 1)`;
				context.lineWidth = width * 0.003;
				context.beginPath();
				context.arc(
					ball.position.x * scale,
					ball.position.z * scale,
					hyperparams.ball.radius * scale,
					0,
					2 * Math.PI,
				);
				context.stroke();
			}
		}

		context.lineJoin = "round";
		context.lineWidth = width * 0.006;
		context.shadowBlur = width * 0.01;
		context.shadowColor = "rgba(255, 255, 255, 0.8)";
		context.strokeStyle = "rgba(255, 255, 255, 1)";
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

		context.shadowColor = "rgba(0, 125, 255, 0.8)";
		context.strokeStyle = `rgba(0, 125, 255, 1)`;
		for (let i = 0; i < initialTrajactory.objectBalls.length; i++) {
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
