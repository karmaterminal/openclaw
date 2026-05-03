export declare const EXEC_NO_OUTPUT_PLACEHOLDER = "(no output)";
export declare function renderExecOutputText(value: string | undefined): string;
export declare function renderExecUpdateText(params: {
    tailText?: string;
    warnings: string[];
}): string;
