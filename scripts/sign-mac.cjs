const path = require("node:path");

module.exports = async (context) => {
  if (context.electronPlatformName !== "darwin") return;

  // Bypass electron-builder's certificate lookup for the "-" identity.
  // shortcut: afterPack assumes no electronFuses; move signing after fuse changes if added.
  await require("@electron/osx-sign").signAsync({
    app: path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`),
    platform: "darwin",
    identity: "-",
    identityValidation: false,
    preEmbedProvisioningProfile: false,
    preAutoEntitlements: false,
    optionsForFile: () => ({ hardenedRuntime: false, timestamp: "none" }),
  });
};
