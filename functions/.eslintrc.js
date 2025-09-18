// functions/.eslintrc.js

module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  parserOptions: {
    // Quan trọng: Báo cho ESLint biết chúng ta đang dùng CommonJS
    sourceType: "commonjs",
  },
  rules: {
    quotes: ["error", "double"],
    // Tạm thời tắt một vài quy tắc không cần thiết để tránh báo lỗi linh tinh
    "require-jsdoc": 0, 
    "valid-jsdoc": 0,
  },
};