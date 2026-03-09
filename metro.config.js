const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Custom resolver: bypass package exports for @babel/runtime/helpers/* to fix
// "asyncToGenerator could not be found" (Metro's exports resolution can fail).
// Use direct file path for CJS helpers; delegate everything else to default.
const babelRuntimeDir = path.join(__dirname, 'node_modules', '@babel', 'runtime');
config.resolver ??= {};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const match = moduleName.match(/^@babel\/runtime\/helpers\/(.+)$/);
  if (match) {
    const helperPath = path.join(babelRuntimeDir, 'helpers', `${match[1]}.js`);
    try {
      const fs = require('fs');
      if (fs.existsSync(helperPath)) {
        return { type: 'sourceFile', filePath: helperPath };
      }
    } catch (_) {}
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
