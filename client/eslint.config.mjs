import typescriptEslint from "@typescript-eslint/eslint-plugin";
import unusedImports from "eslint-plugin-unused-imports";
import tsParser from "@typescript-eslint/parser";

export default [
    {
        files: ["src/**/*.{ts,tsx}"],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2020,
            sourceType: "module",
            parserOptions: {
                ecmaFeatures: { jsx: true }
            }
        },
        plugins: {
            "@typescript-eslint": typescriptEslint,
            "unused-imports": unusedImports,
        },
        rules: {
            "unused-imports/no-unused-imports": "error",
            "unused-imports/no-unused-vars": [
                "error",
                {
                    "vars": "all",
                    "varsIgnorePattern": "^_",
                    "args": "none",
                    "argsIgnorePattern": "^_"
                }
            ]
        }
    }
];
