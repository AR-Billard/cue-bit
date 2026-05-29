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
		context.lineWidth = 2;
		context.beginPath();
		context.moveTo(
			initialTrajactory.target.position.x * scale,
			initialTrajactory.target.position.z * scale,
		);
		for (const trajectory of trajectories) {
			const { target } = trajectory;
			const x = target.position.x * scale;
			const y = target.position.z * scale;

			context.lineTo(x, y);
		}
		context.stroke();

		for (let i = 0; i < initialTrajactory.others.length; i++) {
			context.strokeStyle = `rgba(0, 125, 255, 1)`;
			context.lineWidth = 2;
			context.beginPath();
			context.moveTo(
				initialTrajactory.others[i].position.x * scale,
				initialTrajactory.others[i].position.z * scale,
			);
			for (const trajectory of trajectories) {
				const { others } = trajectory;
				const x = others[i].position.x * scale;
				const y = others[i].position.z * scale;

				context.lineTo(x, y);
			}
			context.stroke();
		}
	});
}
