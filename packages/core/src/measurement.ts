import type { Entity } from "./artifact.js";

export type ComponentMeasurement = {
  height: number;
  lineCount: number;
  width: number;
};

export type MeasurementConstraints = {
  maxLines: number;
  maxWidth: number;
  minHeight: number;
  minWidth: number;
};

export type MeasurementService = {
  measureEntity(entity: Entity, constraints: MeasurementConstraints): ComponentMeasurement;
};

export const estimatedMeasurementService: MeasurementService = {
  measureEntity(entity, constraints) {
    const textWidth = estimateTextWidth(entity.label);
    const longestWord = Math.max(...entity.label.split(/\s+/).map(estimateTextWidth), 0);
    const width = clamp(
      Math.ceil(Math.max(longestWord, Math.min(textWidth, constraints.maxWidth - 28)) + 28),
      constraints.minWidth,
      constraints.maxWidth,
    );
    const contentWidth = Math.max(1, width - 28);
    const lineCount = clamp(Math.ceil(textWidth / contentWidth), 1, constraints.maxLines);
    const height = constraints.minHeight + (lineCount - 1) * 17;
    return { width, height, lineCount };
  },
};

function estimateTextWidth(value: string) {
  let width = 0;
  for (const character of value) {
    if (/\s/.test(character)) width += 3.5;
    else if (/[ilI1.,'`]/.test(character)) width += 3.8;
    else if (/[MW@#%]/.test(character)) width += 9.5;
    else if (character.codePointAt(0)! > 0x7f) width += 8;
    else width += 7;
  }
  return width;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
