export type CostBreakdown = {
  tokens: number;
  usd: number;
  label: string;
};

// Blended per-million-token estimates (input + output average)
const MODEL_RATES_PER_MILLION: Record<string, number> = {
  "gemini-3.7-flash": 1.75, // $0.50 in, $3.00 out blended
  "gemini-3.8-flash": 1.75,
  "openai/gpt-oss-120b": 0.35,
  "openai/gpt-oss-20b": 0.15,
  "qwen/qwen3.8-27b": 0.20,
  "deepseek-ai/deepseek-v4.1-flash": 0.60,
};

export function estimateCost(model: string, tokens: number): CostBreakdown {
  if (!tokens || tokens <= 0) {
    return { tokens: 0, usd: 0, label: "Free tier · $0.00" };
  }

  // Find matching rate by model key substring
  let ratePerMillion = 0.50; // fallback default
  const lower = model.toLowerCase();

  for (const [key, rate] of Object.entries(MODEL_RATES_PER_MILLION)) {
    if (lower.includes(key.toLowerCase()) || lower.includes(key.split("/").pop()!.toLowerCase())) {
      ratePerMillion = rate;
      break;
    }
  }

  if (lower.includes(":free") || lower.includes("free-ai")) {
    ratePerMillion = 0;
  }

  const usd = (tokens / 1_000_000) * ratePerMillion;
  const formattedUsd = usd === 0 ? "$0.00" : usd < 0.0001 ? "<$0.0001" : `$${usd.toFixed(4)}`;

  return {
    tokens,
    usd,
    label: `${formattedUsd} · ${tokens.toLocaleString()} tokens`,
  };
}
