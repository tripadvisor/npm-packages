import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  prettier,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/array-type": ["error", { default: "generic" }],
    },
  },
);
