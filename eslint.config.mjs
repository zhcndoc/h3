import unjs from "eslint-config-unjs";

export default unjs(
  {
    ignores: ["**/.nuxt"],
  },
  {
    rules: {
      "unicorn/no-null": "off",
      "unicorn/number-literal-case": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "unicorn/expiring-todo-comments": "off",
      "@typescript-eslint/ban-types": "off",
      "unicorn/prefer-export-from": "off",
      "unicorn/prefer-string-raw": "off",
      "unicorn/prefer-code-point": "off",
    },
  },
);
