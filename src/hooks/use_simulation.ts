import { useMemo } from "react";
import { SIMULATION_2D_TUNING_VERSION, Simulation2D } from "@/lib/physics";

export default function useSimulation() {
	const sim = useMemo(() => new Simulation2D(), []);

	return {
		sim,
		tuningVersion: SIMULATION_2D_TUNING_VERSION,
	};
}
