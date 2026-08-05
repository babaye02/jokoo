/**
 * with-strip-associated-domains.js — Expo config plugin
 *
 * Suppression DÉFENSIVE de l'entitlement `com.apple.developer.associated-domains`
 * du fichier .entitlements généré par `expo prebuild`.
 *
 * Contexte : le provisioning profile EAS auto-généré (`AppStore_com_jokoo_app_*`)
 * ne supporte pas la capability "Associated Domains" (Universal Links), car cette
 * capability nécessite une activation manuelle dans l'Apple Developer Portal.
 *
 * Bien que nous ayons retiré `ios.associatedDomains` d'app.json, Xcode/EAS
 * continue d'injecter cette entitlement (probablement via un cache credentials
 * ou une sync automatique). Ce plugin s'exécute APRÈS tous les autres et
 * garantit que la clé est absente de l'entitlements finale.
 *
 * Les deep links iOS continueront de fonctionner via le custom scheme `jokoo://`.
 * Les Universal Links (https://jokooservices.com/i/...) resteront temporairement
 * inactifs sur iOS jusqu'à activation manuelle dans Apple Developer Portal.
 */

const { withEntitlementsPlist } = require("expo/config-plugins");

const KEY = "com.apple.developer.associated-domains";

module.exports = function withStripAssociatedDomains(config) {
  return withEntitlementsPlist(config, (cfg) => {
    if (cfg.modResults && Object.prototype.hasOwnProperty.call(cfg.modResults, KEY)) {
      // eslint-disable-next-line no-console
      console.log(
        `[with-strip-associated-domains] Removing '${KEY}' from entitlements (was: ${JSON.stringify(
          cfg.modResults[KEY]
        )})`
      );
      delete cfg.modResults[KEY];
    }
    return cfg;
  });
};
