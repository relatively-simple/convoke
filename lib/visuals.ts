import { z } from "zod";
const caption = z.string().min(1).max(800);
export const visualSchema = z.discriminatedUnion("type", [
  z.object({type:z.literal("table"),caption,headers:z.array(z.string().max(120)).min(1).max(8),rows:z.array(z.array(z.string().max(500)).max(8)).max(60)}),
  z.object({type:z.literal("chart"),caption,kind:z.enum(["bar","line"]),xLabel:z.string().max(100),yLabel:z.string().max(100),data:z.array(z.object({label:z.string().max(100),value:z.number().finite()})).min(1).max(60)}),
  z.object({type:z.literal("mermaid"),caption,source:z.string().min(1).max(12000)}),
  z.object({type:z.literal("svg"),caption,source:z.string().min(1).max(16000)}),
]);
export type Visual = z.infer<typeof visualSchema>;
export const testSchema = z.object({name:z.string().min(1).max(100),steps:z.array(z.object({action:z.enum(["click","input","text","exists"]),selector:z.string().min(1).max(200),value:z.string().max(500).optional()}).refine(step=>step.action!=="text" || !!step.value,"Text assertions require an expected value")).min(1).max(8)});
