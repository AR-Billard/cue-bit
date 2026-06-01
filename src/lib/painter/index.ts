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
		context.lineWidth = width * 0.001;
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
			context.lineWidth = width * 0.001;
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

export function drawMinimapTrajectory(
	canvas: HTMLCanvasElement,
	trajectories: Trajectory[],
) {
	const context = canvas.getContext("2d");
	if (!context) {
		return;
	}

	const tableWidth = 2.844;
	const tableHeight = 1.422;
	const padding = 8;
	const scale = Math.min(
		(canvas.width - padding * 2) / tableWidth,
		(canvas.height - padding * 2) / tableHeight,
	);
	const offsetX = (canvas.width - tableWidth * scale) / 2;
	const offsetY = (canvas.height - tableHeight * scale) / 2;
	const isOnTable = (snapshot: BallSnapshot) =>
		snapshot.position.y >= 0 &&
		snapshot.position.x >= 0 &&
		snapshot.position.x <= tableWidth &&
		snapshot.position.z >= 0 &&
		snapshot.position.z <= tableHeight;
	const drawBallTrajectory = (
		getSnapshot: (trajectory: Trajectory) => BallSnapshot,
		color: string,
	) => {
		const snapshots = trajectories.map(getSnapshot).filter(isOnTable);
		if (snapshots.length === 0) {
			return;
		}

		context.save();
		context.strokeStyle = color;
		context.lineWidth = 1;
		context.setLineDash([3, 3]);
		context.beginPath();
		context.moveTo(
			offsetX + snapshots[0].position.x * scale,
			offsetY + snapshots[0].position.z * scale,
		);
		for (const snapshot of snapshots.slice(1)) {
			context.lineTo(
				offsetX + snapshot.position.x * scale,
				offsetY + snapshot.position.z * scale,
			);
		}
		context.stroke();
		context.restore();

		context.save();
		context.fillStyle = color;
		context.beginPath();
		context.arc(
			offsetX + snapshots[0].position.x * scale,
			offsetY + snapshots[0].position.z * scale,
			2.5,
			0,
			Math.PI * 2,
		);
		context.fill();
		context.restore();
	};

	context.clearRect(0, 0, canvas.width, canvas.height);
	context.save();
	context.strokeStyle = "rgba(0, 229, 255, 0.35)";
	context.lineWidth = 1;
	context.strokeRect(offsetX, offsetY, tableWidth * scale, tableHeight * scale);
	context.restore();

	if (trajectories.length === 0) {
		return;
	}

	drawBallTrajectory((trajectory) => trajectory.cueBall, "#ffffff");
	for (let i = 0; i < trajectories[0].objectBalls.length; i++) {
		drawBallTrajectory(
			(trajectory) => trajectory.objectBalls[i],
			"rgba(0, 125, 255, 1)",
		);
	}
}

export * from "./transform";
