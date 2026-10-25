import {useEffect, useState} from "react";

export const useReplicant = <T>(name: string): T | undefined => {
	const [value, setValue] = useState<T | undefined>(
		() => nodecg.Replicant<T>(name).value,
	);

	useEffect(() => {
		const replicant = nodecg.Replicant<T>(name);
		const handleChange = (next: T | undefined) => {
			setValue(next);
		};
		replicant.on("change", handleChange);
		setValue(replicant.value);
		return () => {
			replicant.removeListener("change", handleChange);
		};
	}, [name]);

	return value;
};
