export type SnippetCategory =
	| "complex-cmd"
	| "declaration"
	| "idiom"
	| "pattern";

export interface ZshSnippet {
	prefix: string;
	name: string;
	body: string[];
	desc: string;
	category: SnippetCategory;
	syntax?: string;
}
