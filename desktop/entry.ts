// Keep ordinary bootstrap side effects outside the helper's early entry.
if (process.argv.includes("--emc2-keychain-helper")) {
  const fatal = () => process.exit(1);
  // Electron's default uncaught handler can show raw exception text in a dialog.
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);
  process.stdout.on("error", fatal);
  try { require("./keychain-helper.js").runHelper().catch(fatal); }
  catch { fatal(); }
} else {
  require("./main.js");
}
