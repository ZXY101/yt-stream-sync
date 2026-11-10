export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      1,
      "always",
      ["controller", "popup", "background", "content", "e2e", "ci", "deps", "docs", "release"],
    ],
  },
};
