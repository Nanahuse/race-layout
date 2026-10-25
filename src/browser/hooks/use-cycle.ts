import {useEffect, useState} from "react";

export const useCycle = (length: number, intervalMs: number): number => {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		setIndex(0);
		if (length <= 1) return;
		const timer = setInterval(() => {
			setIndex((current) => (current + 1) % length);
		}, intervalMs);
		return () => clearInterval(timer);
	}, [length, intervalMs]);

	return length <= 0 ? 0 : Math.min(index, length - 1);
};
