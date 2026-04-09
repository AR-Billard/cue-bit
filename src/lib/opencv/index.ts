/**
 * https://github.com/TechStark/opencv-js-examples/blob/main/opencv-js-react-example/src/opencv/opencv.js
 */

import cvModule from "@techstark/opencv-js";

export async function getOpenCv() {
	let cv: typeof cvModule;
	if (cvModule instanceof Promise) {
		cv = await cvModule;
	} else {
		if (cvModule.Mat) {
			// already initialized
			cv = cvModule;
		} else {
			await new Promise<void>((resolve) => {
				cvModule.onRuntimeInitialized = () => resolve();
			});
			cv = cvModule;
		}
	}
	return { cv };
}

export function translateException(cv: typeof cvModule, err: unknown) {
	if (typeof err === "number") {
		try {
			const exception = cv.exceptionFromPtr(err);
			return exception;
		} catch (_error) {
			// ignore
		}
	}
	return err;
}
