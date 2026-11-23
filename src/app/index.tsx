import { Text, View } from "react-native";

/**
 * Setup verification screen for NativeWind v5 + the REPAGE Material 3 tokens.
 * Every style below uses theme tokens only (bg-background, text-on-surface,
 * ...) — no hardcoded color values, per Docs/DESIGN_SYSTEM.md.
 * Adapt or replace freely once real screens exist.
 */
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-4">
      <View className="w-full max-w-sm items-center gap-3 rounded-lg bg-surface-container-high p-6">
        <Text className="text-2xl font-bold text-on-surface">REPAGE</Text>
        <Text className="text-center text-sm text-on-surface-variant">
          Edit src/app/index.tsx to edit this screen.
        </Text>
        <View className="rounded-full bg-primary px-4 py-2">
          <Text className="text-sm font-medium text-on-primary">
            NativeWind v5 ready
          </Text>
        </View>
      </View>
    </View>
  );
}
