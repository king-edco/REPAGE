// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// REPAGE Material 3 color roles change with the system color scheme:
// global.css overrides them under `@media (prefers-color-scheme: dark)`.
// Keep them as variable references at runtime instead of letting the
// native compiler inline their light values into the utilities
// (see https://www.nativewind.dev/v5/guides/themes — inlineVariables.exclude).
const m3ColorRoles = [
  '--color-primary',
  '--color-on-primary',
  '--color-primary-container',
  '--color-on-primary-container',
  '--color-secondary',
  '--color-on-secondary',
  '--color-secondary-container',
  '--color-on-secondary-container',
  '--color-tertiary',
  '--color-on-tertiary',
  '--color-tertiary-container',
  '--color-on-tertiary-container',
  '--color-error',
  '--color-on-error',
  '--color-error-container',
  '--color-on-error-container',
  '--color-background',
  '--color-on-background',
  '--color-surface',
  '--color-on-surface',
  '--color-surface-variant',
  '--color-on-surface-variant',
  '--color-surface-dim',
  '--color-surface-bright',
  '--color-surface-container-lowest',
  '--color-surface-container-low',
  '--color-surface-container',
  '--color-surface-container-high',
  '--color-surface-container-highest',
  '--color-outline',
  '--color-outline-variant',
  '--color-inverse-surface',
  '--color-inverse-on-surface',
  '--color-inverse-primary',
  '--color-surface-tint',
  '--color-scrim',
  '--color-shadow',
  '--color-primary-fixed',
  '--color-on-primary-fixed',
  '--color-primary-fixed-dim',
  '--color-on-primary-fixed-variant',
  '--color-secondary-fixed',
  '--color-on-secondary-fixed',
  '--color-secondary-fixed-dim',
  '--color-on-secondary-fixed-variant',
  '--color-tertiary-fixed',
  '--color-on-tertiary-fixed',
  '--color-tertiary-fixed-dim',
  '--color-on-tertiary-fixed-variant',
];

module.exports = withNativewind(config, {
  inlineVariables: { exclude: m3ColorRoles },
});
