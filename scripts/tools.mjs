export const toolIds = ["transcode", "youtube-audio", "hwp", "portadj"];
export function toolArgument() {
  const tool =
    process.argv.slice(2).find((value) => value !== "--") ??
    process.env.TOOL_ID;
  if (!toolIds.includes(tool))
    throw new Error(`Choose one tool: ${toolIds.join(", ")}`);
  return tool;
}
