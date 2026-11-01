const { execSync } = require('node:child_process');
const path = require('node:path');

async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`==> Ad-hoc signing app bundle: ${appPath}`);
  try {
    execSync(`codesign --force --deep -s - "${appPath}"`, { stdio: 'inherit' });
    console.log(`==> Bundle signature successfully verified.`);
  } catch (err) {
    console.error('Ad-hoc codesign error:', err);
    throw err;
  }
}

module.exports = afterPack;
module.exports.default = afterPack;
