// Date utilities
export const formatDate = (date: string | Date): string => {
	const d = new Date(date);
	return d.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

export const formatDateTime = (date: string | Date): string => {
	const d = new Date(date);
	return d.toLocaleString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

export const isValidDate = (date: string | Date): boolean => {
	const d = new Date(date);
	return !Number.isNaN(d.getTime());
};

// File utilities
export const formatFileSize = (bytes: number): string => {
	const sizes = ["Bytes", "KB", "MB", "GB"];
	if (bytes === 0) return "0 Bytes";
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
};

export const getFileExtension = (fileName: string): string => {
	return fileName.split(".").pop()?.toLowerCase() || "";
};

export const isValidFileType = (fileName: string): boolean => {
	const ext = getFileExtension(fileName);
	return ["pdf", "docx"].includes(ext);
};

// String utilities
export const truncateText = (text: string, maxLength: number): string => {
	if (text.length <= maxLength) return text;
	return `${text.substring(0, maxLength).trim()}...`;
};

export const generateId = (): string => {
	return `${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
};

export const slugify = (text: string): string => {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
};

// Validation utilities
export const isValidEmail = (email: string): boolean => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
};

export const isValidUrl = (url: string): boolean => {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
};

// Array utilities
export const chunk = <T>(array: T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let i = 0; i < array.length; i += size) {
		chunks.push(array.slice(i, i + size));
	}
	return chunks;
};

export const unique = <T>(array: T[]): T[] => {
	return [...new Set(array)];
};

export const groupBy = <T, K extends keyof T>(
	array: T[],
	key: K,
): Record<string, T[]> => {
	return array.reduce(
		(groups, item) => {
			const group = String(item[key]);
			if (!groups[group]) {
				groups[group] = [];
			}
			groups[group].push(item);
			return groups;
		},
		{} as Record<string, T[]>,
	);
};

// Debounce utility
export const debounce = <T extends (...args: unknown[]) => void>(
	func: T,
	delay: number,
): ((...args: Parameters<T>) => void) => {
	let timeoutId: ReturnType<typeof setTimeout>;
	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), delay);
	};
};
