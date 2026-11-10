// Runs Mozilla's add-on linter (`web-ext lint`) on dist/ and fails on any error, warning or
// notice, except the ones listed below. Each allowed finding needs a reason.
import { cmd } from "web-ext";

const ALLOWED = [
  {
    // react-dom sets innerHTML internally; AMO reviewers accept it in a known library.
    code: "UNSAFE_VAR_ASSIGNMENT",
    file: "chunks/vendor.js",
  },
];

function isAllowed(finding) {
  return ALLOWED.some((rule) => rule.code === finding.code && rule.file === finding.file);
}

const report = await cmd.lint({ sourceDir: "dist", output: "none" }, { shouldExitProgram: false });
const findings = [...report.errors, ...report.warnings, ...report.notices];
const blocking = findings.filter((finding) => !isAllowed(finding));

for (const finding of blocking) {
  console.error(`${finding.code} ${finding.file ?? ""}:${finding.line ?? ""} ${finding.message}`);
}
console.warn(
  `web-ext lint: ${blocking.length} blocking, ${findings.length - blocking.length} allowed`,
);
process.exitCode = blocking.length > 0 ? 1 : 0;
