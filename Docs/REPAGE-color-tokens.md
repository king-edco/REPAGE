# REPAGE — Color Tokens (Material 3)

> **Status:** DRAFT for review. Single source of truth for REPAGE colors, to be used by every coding agent.
> **Generated:** 2026-10-08 from a Material Theme Builder export (`material-theme.json`, source color `#1F7A4D`).
> **Rule:** no hex value is ever written inside a screen or component. Screens read roles from `MaterialTheme.colorScheme`. Values live only in the theme files.

---

## 1. Decisions

| Item | Decision | Source |
|---|---|---|
| Mood | Professional, polished, calm green. Not vivid (long reading sessions). | Product decision |
| Source (seed) color | `#1F7A4D` | Product decision |
| Palette generator | Material Theme Builder (exports Compose theme files) | Android Developers, "Material Design 3 in Compose" (Color scheme → Generate color schemes) |
| Minimum Android version | API 28 (Android 9) | Product decision |
| Light and dark | Both required for every role | DESIGN_SYSTEM rule 2 |
| Dynamic color (wallpaper-based) | **OPEN.** See section 5. | — |
| Use of `tertiary` | **OPEN.** The generated tertiary is a blue-teal, not green. Decide if it is used at all (DESIGN_SYSTEM §2.2 says "si utilisée"). | — |
| Medium / high contrast variants | **OPEN.** Exported (Appendix A) but not adopted yet. See section 6. | — |

### 1.1 Which values are authoritative

- The role values in the `schemes` block of the export are the source of truth. They are the values Theme Builder shows as roles and exports as theme code.
- The seed `#1F7A4D` is only the starting point. It is **not** the `primary` role. The light `primary` is `#2A6A47` and the dark `primary` is `#93D5AA`.
- The export also contains a `palettes` block (tonal palettes). Its values do **not** match the `schemes` block (for example palette primary tone 40 is `#066C41` while the light `primary` role is `#2A6A47`). They are therefore **not reproduced here** and must not be used. To be re-checked against the Theme Builder screen (see section 7).

## 2. How the system works (summary of the official docs)

- A color scheme starts from five key colors. Each key color has a tonal palette of 13 tones, and the roles pick specific tones. (Android Developers, "Material Design 3 in Compose")
- Roles come in pairs: use `onX` on top of `X`, and `onXContainer` on top of `XContainer`. Mixing pairs gives poor contrast; the official page shows a tertiary container with a primary container as a counter-example. (Android Developers)
- `primary` is for the most prominent components and active states. `secondary` is for less prominent components. `tertiary` is for contrasting accents. (Android Developers)
- In the baseline scheme, light `primary` uses tone 40 and dark `primary` uses tone 80. When customizing, keep the same luminance level so contrast requirements still hold. (material-components-android, Color theming)
- Tonal surface roles (`surfaceContainer*`, `surfaceDim`, `surfaceBright`) are the default container colors of Material 3 components. (material-components-android, Color theming)
- Do not name an app color after a color slot (no `color_primary`); use names that describe the value. (material-components-android, Color theming)

## 3. Color roles — light and dark

Format: `#RRGGBB`. All values come from the `schemes.light` and `schemes.dark` blocks of the export.

### 3.1 Accent and error roles

| Role | Light | Dark |
|---|---|---|
| `primary` | `#2A6A47` | `#93D5AA` |
| `onPrimary` | `#FFFFFF` | `#00391F` |
| `primaryContainer` | `#AFF2C5` | `#0B5131` |
| `onPrimaryContainer` | `#0B5131` | `#AFF2C5` |
| `secondary` | `#4E6354` | `#B5CCBA` |
| `onSecondary` | `#FFFFFF` | `#213528` |
| `secondaryContainer` | `#D1E8D5` | `#374B3D` |
| `onSecondaryContainer` | `#374B3D` | `#D1E8D5` |
| `tertiary` | `#3B6470` | `#A3CDDB` |
| `onTertiary` | `#FFFFFF` | `#033541` |
| `tertiaryContainer` | `#BFE9F8` | `#224C58` |
| `onTertiaryContainer` | `#224C58` | `#BFE9F8` |
| `error` | `#BA1A1A` | `#FFB4AB` |
| `onError` | `#FFFFFF` | `#690005` |
| `errorContainer` | `#FFDAD6` | `#93000A` |
| `onErrorContainer` | `#93000A` | `#FFDAD6` |

### 3.2 Background and surface roles

| Role | Light | Dark |
|---|---|---|
| `background` | `#F6FBF4` | `#0F1511` |
| `onBackground` | `#181D19` | `#DFE4DD` |
| `surface` | `#F6FBF4` | `#0F1511` |
| `onSurface` | `#181D19` | `#DFE4DD` |
| `surfaceVariant` | `#DCE5DB` | `#414942` |
| `onSurfaceVariant` | `#414942` | `#C0C9C0` |
| `surfaceDim` | `#D6DBD5` | `#0F1511` |
| `surfaceBright` | `#F6FBF4` | `#353B36` |
| `surfaceContainerLowest` | `#FFFFFF` | `#0A0F0C` |
| `surfaceContainerLow` | `#F0F5EE` | `#181D19` |
| `surfaceContainer` | `#EAEFE8` | `#1C211D` |
| `surfaceContainerHigh` | `#E5EAE3` | `#262B27` |
| `surfaceContainerHighest` | `#DFE4DD` | `#313631` |

### 3.3 Outline, inverse and utility roles

| Role | Light | Dark |
|---|---|---|
| `outline` | `#717972` | `#8A938B` |
| `outlineVariant` | `#C0C9C0` | `#414942` |
| `inverseSurface` | `#2C322D` | `#DFE4DD` |
| `inverseOnSurface` | `#EDF2EB` | `#2C322D` |
| `inversePrimary` | `#93D5AA` | `#2A6A47` |
| `scrim` | `#000000` | `#000000` |
| `shadow` | `#000000` | `#000000` |
| `surfaceTint` | `#2A6A47` | `#93D5AA` |

### 3.4 Fixed roles (exported, not listed in DESIGN_SYSTEM §2.2)

These roles keep the same color in light and dark. Not needed for the first screens. Availability as `ColorScheme` parameters depends on the Material 3 Compose version pinned in the project (to verify against the API reference before use).

| Role | Light | Dark |
|---|---|---|
| `primaryFixed` | `#AFF2C5` | `#AFF2C5` |
| `onPrimaryFixed` | `#002110` | `#002110` |
| `primaryFixedDim` | `#93D5AA` | `#93D5AA` |
| `onPrimaryFixedVariant` | `#0B5131` | `#0B5131` |
| `secondaryFixed` | `#D1E8D5` | `#D1E8D5` |
| `onSecondaryFixed` | `#0C1F14` | `#0C1F14` |
| `secondaryFixedDim` | `#B5CCBA` | `#B5CCBA` |
| `onSecondaryFixedVariant` | `#374B3D` | `#374B3D` |
| `tertiaryFixed` | `#BFE9F8` | `#BFE9F8` |
| `onTertiaryFixed` | `#001F27` | `#001F27` |
| `tertiaryFixedDim` | `#A3CDDB` | `#A3CDDB` |
| `onTertiaryFixedVariant` | `#224C58` | `#224C58` |

## 4. Contrast check (computed)

Ratios computed with the WCAG 2.x relative-luminance formula on the values above. This is our own calculation, not an official Material table. The thresholds to adopt (DESIGN_SYSTEM §2.5) are still to be confirmed against the official accessibility page. Usual WCAG references: 4.5:1 for normal text, 3:1 for large text and UI components.

| Foreground | Background | Use | Light | Dark |
|---|---|---|---|---|
| `onPrimary` | `primary` | text | 6.46:1 | 7.69:1 |
| `onPrimaryContainer` | `primaryContainer` | text | 7.30:1 | 7.30:1 |
| `onSecondary` | `secondary` | text | 6.49:1 | 7.67:1 |
| `onSecondaryContainer` | `secondaryContainer` | text | 7.25:1 | 7.25:1 |
| `onTertiary` | `tertiary` | text | 6.48:1 | 7.75:1 |
| `onTertiaryContainer` | `tertiaryContainer` | text | 7.24:1 | 7.24:1 |
| `onError` | `error` | text | 6.46:1 | 7.72:1 |
| `onErrorContainer` | `errorContainer` | text | 7.24:1 | 7.24:1 |
| `onSurface` | `surface` | text | 16.30:1 | 14.33:1 |
| `onSurfaceVariant` | `surfaceVariant` | text | 7.21:1 | 5.48:1 |
| `onBackground` | `background` | text | 16.30:1 | 14.33:1 |
| `inverseOnSurface` | `inverseSurface` | text | 11.55:1 | 10.17:1 |
| `primary` | `surface` | text (links, accent text) | 6.16:1 | 10.86:1 |
| `outline` | `surface` | non-text (UI boundaries) | 4.28:1 | 5.84:1 |
| `outlineVariant` | `surface` | decorative (dividers) | 1.62:1 | 1.99:1 |

## 5. Dynamic color (OPEN DECISION)

Facts from the official docs:
- Dynamic color derives the scheme from the user's wallpaper. It is available on Android 12 and above (API 31+). Below that, the app must fall back to its own light or dark scheme. (Android Developers)
- The documented pattern checks `Build.VERSION.SDK_INT >= Build.VERSION_CODES.S`, then uses `dynamicDarkColorScheme(context)` or `dynamicLightColorScheme(context)`, otherwise the custom scheme. (Android Developers)
- If dynamic color is applied, the brand green is replaced on those devices.
- With minSdk 28, devices on Android 9, 10 and 11 always use the REPAGE scheme.

Options:
- **A. Off.** REPAGE green everywhere. Consistent identity and consistent screenshots.
- **B. On by default.** Matches the system on Android 12+, but the brand color disappears for those users.
- **C. Off by default, opt-in setting.** Identity preserved, personalization available.

Recommendation (designer view): **C**, or **A** if the settings screen must stay minimal. Final decision pending.

## 6. Contrast control (OPEN DECISION)

- With dynamic color, contrast control comes for free on Android 14+ ("U+" in the library docs). Without dynamic color, the app must supply its own medium and high contrast theme overlays and apply them with the `ColorContrast` API of the Material Components library. (material-components-android, Color theming)
- The export already contains medium and high contrast schemes for light and dark (Appendix A), so the data exists if we adopt this later.
- To be decided with DESIGN_SYSTEM §12 (accessibility).

## 7. To verify before freezing this file

1. In Theme Builder, with source `#1F7A4D`, the light `primary` role must read `#2A6A47` and the dark `primary` `#93D5AA`.
2. Check on the Theme Builder screen whether the tonal palettes shown there match the `palettes` block of the export. If not, ignore palettes (as this file does).
3. Decide the three OPEN items in section 1.
4. Semantic colors (success, warning, info, heart, star, highlight) and reading themes (paper, sepia, OLED) are **not defined yet** (DESIGN_SYSTEM §2.3 and §2.4).
5. Confirm contrast thresholds against the official Material accessibility page (§2.5).

## 8. Compose wiring (pattern from the official docs)

Structure documented by Android Developers: one `lightColorScheme(...)` and one `darkColorScheme(...)` built from the values above, chosen with `isSystemInDarkTheme()`, then passed to `MaterialTheme(colorScheme = ...)`. Screens read colors only through `MaterialTheme.colorScheme.<role>`. The exact list of parameters accepted by `lightColorScheme` and `darkColorScheme` must be checked against the API reference of the Material 3 version pinned in the project.

Files (see DESIGN_SYSTEM §15): colors in `Color.kt`, scheme setup in `Theme.kt`.

Constants below are generated from the tables above. Naming (`<role>Light` / `<role>Dark`) is ours; if the `Color.kt` exported by Theme Builder is used as-is, keep its names instead.

```kotlin
// Light
val primaryLight = Color(0xFF2A6A47)
val onPrimaryLight = Color(0xFFFFFFFF)
val primaryContainerLight = Color(0xFFAFF2C5)
val onPrimaryContainerLight = Color(0xFF0B5131)
val secondaryLight = Color(0xFF4E6354)
val onSecondaryLight = Color(0xFFFFFFFF)
val secondaryContainerLight = Color(0xFFD1E8D5)
val onSecondaryContainerLight = Color(0xFF374B3D)
val tertiaryLight = Color(0xFF3B6470)
val onTertiaryLight = Color(0xFFFFFFFF)
val tertiaryContainerLight = Color(0xFFBFE9F8)
val onTertiaryContainerLight = Color(0xFF224C58)
val errorLight = Color(0xFFBA1A1A)
val onErrorLight = Color(0xFFFFFFFF)
val errorContainerLight = Color(0xFFFFDAD6)
val onErrorContainerLight = Color(0xFF93000A)
val backgroundLight = Color(0xFFF6FBF4)
val onBackgroundLight = Color(0xFF181D19)
val surfaceLight = Color(0xFFF6FBF4)
val onSurfaceLight = Color(0xFF181D19)
val surfaceVariantLight = Color(0xFFDCE5DB)
val onSurfaceVariantLight = Color(0xFF414942)
val surfaceDimLight = Color(0xFFD6DBD5)
val surfaceBrightLight = Color(0xFFF6FBF4)
val surfaceContainerLowestLight = Color(0xFFFFFFFF)
val surfaceContainerLowLight = Color(0xFFF0F5EE)
val surfaceContainerLight = Color(0xFFEAEFE8)
val surfaceContainerHighLight = Color(0xFFE5EAE3)
val surfaceContainerHighestLight = Color(0xFFDFE4DD)
val outlineLight = Color(0xFF717972)
val outlineVariantLight = Color(0xFFC0C9C0)
val inverseSurfaceLight = Color(0xFF2C322D)
val inverseOnSurfaceLight = Color(0xFFEDF2EB)
val inversePrimaryLight = Color(0xFF93D5AA)
val scrimLight = Color(0xFF000000)
val shadowLight = Color(0xFF000000)
val surfaceTintLight = Color(0xFF2A6A47)
val primaryFixedLight = Color(0xFFAFF2C5)
val onPrimaryFixedLight = Color(0xFF002110)
val primaryFixedDimLight = Color(0xFF93D5AA)
val onPrimaryFixedVariantLight = Color(0xFF0B5131)
val secondaryFixedLight = Color(0xFFD1E8D5)
val onSecondaryFixedLight = Color(0xFF0C1F14)
val secondaryFixedDimLight = Color(0xFFB5CCBA)
val onSecondaryFixedVariantLight = Color(0xFF374B3D)
val tertiaryFixedLight = Color(0xFFBFE9F8)
val onTertiaryFixedLight = Color(0xFF001F27)
val tertiaryFixedDimLight = Color(0xFFA3CDDB)
val onTertiaryFixedVariantLight = Color(0xFF224C58)

// Dark
val primaryDark = Color(0xFF93D5AA)
val onPrimaryDark = Color(0xFF00391F)
val primaryContainerDark = Color(0xFF0B5131)
val onPrimaryContainerDark = Color(0xFFAFF2C5)
val secondaryDark = Color(0xFFB5CCBA)
val onSecondaryDark = Color(0xFF213528)
val secondaryContainerDark = Color(0xFF374B3D)
val onSecondaryContainerDark = Color(0xFFD1E8D5)
val tertiaryDark = Color(0xFFA3CDDB)
val onTertiaryDark = Color(0xFF033541)
val tertiaryContainerDark = Color(0xFF224C58)
val onTertiaryContainerDark = Color(0xFFBFE9F8)
val errorDark = Color(0xFFFFB4AB)
val onErrorDark = Color(0xFF690005)
val errorContainerDark = Color(0xFF93000A)
val onErrorContainerDark = Color(0xFFFFDAD6)
val backgroundDark = Color(0xFF0F1511)
val onBackgroundDark = Color(0xFFDFE4DD)
val surfaceDark = Color(0xFF0F1511)
val onSurfaceDark = Color(0xFFDFE4DD)
val surfaceVariantDark = Color(0xFF414942)
val onSurfaceVariantDark = Color(0xFFC0C9C0)
val surfaceDimDark = Color(0xFF0F1511)
val surfaceBrightDark = Color(0xFF353B36)
val surfaceContainerLowestDark = Color(0xFF0A0F0C)
val surfaceContainerLowDark = Color(0xFF181D19)
val surfaceContainerDark = Color(0xFF1C211D)
val surfaceContainerHighDark = Color(0xFF262B27)
val surfaceContainerHighestDark = Color(0xFF313631)
val outlineDark = Color(0xFF8A938B)
val outlineVariantDark = Color(0xFF414942)
val inverseSurfaceDark = Color(0xFFDFE4DD)
val inverseOnSurfaceDark = Color(0xFF2C322D)
val inversePrimaryDark = Color(0xFF2A6A47)
val scrimDark = Color(0xFF000000)
val shadowDark = Color(0xFF000000)
val surfaceTintDark = Color(0xFF93D5AA)
val primaryFixedDark = Color(0xFFAFF2C5)
val onPrimaryFixedDark = Color(0xFF002110)
val primaryFixedDimDark = Color(0xFF93D5AA)
val onPrimaryFixedVariantDark = Color(0xFF0B5131)
val secondaryFixedDark = Color(0xFFD1E8D5)
val onSecondaryFixedDark = Color(0xFF0C1F14)
val secondaryFixedDimDark = Color(0xFFB5CCBA)
val onSecondaryFixedVariantDark = Color(0xFF374B3D)
val tertiaryFixedDark = Color(0xFFBFE9F8)
val onTertiaryFixedDark = Color(0xFF001F27)
val tertiaryFixedDimDark = Color(0xFFA3CDDB)
val onTertiaryFixedVariantDark = Color(0xFF224C58)
```

## Appendix A — Medium and high contrast schemes (not adopted)

### A.1 Light medium contrast vs light high contrast

| Role | Medium | High |
|---|---|---|
| `primary` | `#003F23` | `#00341C` |
| `onPrimary` | `#FFFFFF` | `#FFFFFF` |
| `primaryContainer` | `#3A7955` | `#0F5433` |
| `onPrimaryContainer` | `#FFFFFF` | `#FFFFFF` |
| `secondary` | `#273A2D` | `#1D3024` |
| `onSecondary` | `#FFFFFF` | `#FFFFFF` |
| `secondaryContainer` | `#5D7263` | `#3A4E40` |
| `onSecondaryContainer` | `#FFFFFF` | `#FFFFFF` |
| `tertiary` | `#0C3B47` | `#00313C` |
| `onTertiary` | `#FFFFFF` | `#FFFFFF` |
| `tertiaryContainer` | `#4A737F` | `#244F5A` |
| `onTertiaryContainer` | `#FFFFFF` | `#FFFFFF` |
| `error` | `#740006` | `#600004` |
| `onError` | `#FFFFFF` | `#FFFFFF` |
| `errorContainer` | `#CF2C27` | `#98000A` |
| `onErrorContainer` | `#FFFFFF` | `#FFFFFF` |
| `background` | `#F6FBF4` | `#F6FBF4` |
| `onBackground` | `#181D19` | `#181D19` |
| `surface` | `#F6FBF4` | `#F6FBF4` |
| `onSurface` | `#0D120F` | `#000000` |
| `surfaceVariant` | `#DCE5DB` | `#DCE5DB` |
| `onSurfaceVariant` | `#303832` | `#000000` |
| `surfaceDim` | `#C3C8C1` | `#B5BAB4` |
| `surfaceBright` | `#F6FBF4` | `#F6FBF4` |
| `surfaceContainerLowest` | `#FFFFFF` | `#FFFFFF` |
| `surfaceContainerLow` | `#F0F5EE` | `#EDF2EB` |
| `surfaceContainer` | `#E5EAE3` | `#DFE4DD` |
| `surfaceContainerHigh` | `#D9DED7` | `#D1D6CF` |
| `surfaceContainerHighest` | `#CED3CC` | `#C3C8C1` |
| `outline` | `#4C544E` | `#262E28` |
| `outlineVariant` | `#676F68` | `#434B44` |
| `inverseSurface` | `#2C322D` | `#2C322D` |
| `inverseOnSurface` | `#EDF2EB` | `#FFFFFF` |
| `inversePrimary` | `#93D5AA` | `#93D5AA` |
| `scrim` | `#000000` | `#000000` |
| `shadow` | `#000000` | `#000000` |
| `surfaceTint` | `#2A6A47` | `#2A6A47` |

### A.2 Dark medium contrast vs dark high contrast

| Role | Medium | High |
|---|---|---|
| `primary` | `#A8EBBF` | `#BDFFD2` |
| `onPrimary` | `#002C17` | `#000000` |
| `primaryContainer` | `#5E9E76` | `#8FD1A6` |
| `onPrimaryContainer` | `#000000` | `#000F05` |
| `secondary` | `#CBE2CF` | `#DEF6E3` |
| `onSecondary` | `#162A1D` | `#000000` |
| `secondaryContainer` | `#809685` | `#B1C8B6` |
| `onSecondaryContainer` | `#000000` | `#000F05` |
| `tertiary` | `#B9E3F1` | `#D8F5FF` |
| `onTertiary` | `#002A34` | `#000000` |
| `tertiaryContainer` | `#6E97A4` | `#9FC9D7` |
| `onTertiaryContainer` | `#000000` | `#000D12` |
| `error` | `#FFD2CC` | `#FFECE9` |
| `onError` | `#540003` | `#000000` |
| `errorContainer` | `#FF5449` | `#FFAEA4` |
| `onErrorContainer` | `#000000` | `#220001` |
| `background` | `#0F1511` | `#0F1511` |
| `onBackground` | `#DFE4DD` | `#DFE4DD` |
| `surface` | `#0F1511` | `#0F1511` |
| `onSurface` | `#FFFFFF` | `#FFFFFF` |
| `surfaceVariant` | `#414942` | `#414942` |
| `onSurfaceVariant` | `#D6DFD5` | `#FFFFFF` |
| `surfaceDim` | `#0F1511` | `#0F1511` |
| `surfaceBright` | `#404641` | `#4C514C` |
| `surfaceContainerLowest` | `#040806` | `#000000` |
| `surfaceContainerLow` | `#1A1F1B` | `#1C211D` |
| `surfaceContainer` | `#242925` | `#2C322D` |
| `surfaceContainerHigh` | `#2E342F` | `#373D38` |
| `surfaceContainerHighest` | `#393F3A` | `#434843` |
| `outline` | `#ACB4AC` | `#EAF2E9` |
| `outlineVariant` | `#8A928A` | `#BCC5BC` |
| `inverseSurface` | `#DFE4DD` | `#DFE4DD` |
| `inverseOnSurface` | `#262B27` | `#000000` |
| `inversePrimary` | `#0D5332` | `#0D5332` |
| `scrim` | `#000000` | `#000000` |
| `shadow` | `#000000` | `#000000` |
| `surfaceTint` | `#93D5AA` | `#93D5AA` |

## Appendix B — Sources

Read:
- Android Developers, "Material Design 3 in Compose" (page last updated 2026-10-01): https://developer.android.com/develop/ui/compose/designsystems/material3
- material-components-android, "Color theming": https://github.com/material-components/material-components-android/blob/master/docs/theming/Color.md
- Material Theme Builder export dated 2026-10-08 (`material-theme.json`).

Not readable by Claude (JavaScript-only pages), to be pasted by the owner if exact wording is needed:
- https://m3.material.io/styles/color/system/overview
- https://m3.material.io/styles/color/system/how-the-system-works
- https://m3.material.io/foundations/design-tokens/overview
