const { withXcodeProject } = require('@expo/config-plugins');

module.exports = function applySigningConfig(config) {
  return withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults;
    const target = proj.getFirstTarget();

    // 安全获取 build configurations
    if (!target || !target.buildConfigurationList || !target.buildConfigurationList.buildConfigurations) {
      return cfg;
    }

    for (const bc of target.buildConfigurationList.buildConfigurations) {
      const bs = bc.buildSettings;
      bs['DEVELOPMENT_TEAM'] = '2BQ24FUN6Z';
      bs['CODE_SIGN_STYLE'] = 'Manual';
      bs['CODE_SIGN_IDENTITY'] = 'Apple Development: 伟 李 (R9Z3N66W68)';
      bs['PROVISIONING_PROFILE_SPECIFIER'] = 'match Development com.hrbbcfc.client';
    }
    return cfg;
  });
};
