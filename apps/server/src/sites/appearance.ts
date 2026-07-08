import {
  operatorUiThemeInputSchema,
  operatorUiThemeSchema,
  type OperatorUiTheme,
  type OperatorUiThemeInput
} from "./schemas.js";

const palettes: Record<NonNullable<OperatorUiThemeInput["preset"]>, Required<OperatorUiThemeInput["colors"]>> = {
  aquatrace: {
    shellBackground: "#ede2cf",
    panelBackground: "#fffaf0",
    headerBackground: "#26352c",
    accent: "#b06b34",
    accentText: "#fff8ea",
    userBubble: "#315f58",
    assistantBubble: "#fff8ea",
    text: "#26352c"
  },
  deep_water: {
    shellBackground: "#dceff1",
    panelBackground: "#f6ffff",
    headerBackground: "#07363d",
    accent: "#0e7490",
    accentText: "#f8fdff",
    userBubble: "#155e75",
    assistantBubble: "#f0fdfa",
    text: "#102a2d"
  },
  high_contrast: {
    shellBackground: "#f7f7f2",
    panelBackground: "#ffffff",
    headerBackground: "#111827",
    accent: "#ca4a24",
    accentText: "#ffffff",
    userBubble: "#0f172a",
    assistantBubble: "#fef3c7",
    text: "#111827"
  },
  sandbar: {
    shellBackground: "#f2e0ba",
    panelBackground: "#fff7df",
    headerBackground: "#5d3d24",
    accent: "#d97706",
    accentText: "#fffaf0",
    userBubble: "#7c4a1f",
    assistantBubble: "#fffaf0",
    text: "#382817"
  }
};

export function defaultOperatorUiTheme(tenantId: string, updatedBy = "system", now = new Date().toISOString()): OperatorUiTheme {
  return operatorUiThemeSchema.parse({
    id: `${tenantId}_job_desk`,
    tenantId,
    surface: "job_desk",
    name: "Aquatrace Job Desk",
    colors: palettes.aquatrace,
    density: "comfortable",
    updatedBy,
    updatedAt: now
  }) as OperatorUiTheme;
}

export function buildOperatorUiTheme(input: {
  tenantId: string;
  patch: unknown;
  existing?: OperatorUiTheme | null | undefined;
  actorId: string;
  now?: string | undefined;
}): OperatorUiTheme {
  const parsed = operatorUiThemeInputSchema.parse(input.patch);
  const base = input.existing ?? defaultOperatorUiTheme(input.tenantId, input.actorId, input.now ?? new Date().toISOString());
  const presetColors = parsed.preset ? palettes[parsed.preset] : {};
  const now = input.now ?? new Date().toISOString();

  return operatorUiThemeSchema.parse({
    ...base,
    tenantId: input.tenantId,
    name: parsed.name ?? base.name,
    colors: {
      ...base.colors,
      ...presetColors,
      ...parsed.colors
    },
    density: parsed.density ?? base.density,
    updatedBy: input.actorId,
    updatedAt: now
  }) as OperatorUiTheme;
}

