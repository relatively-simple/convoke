import Markdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { normalizeMath } from "../lib/presentation";
export function Answer({text}: {text:string}) {
  return <div className="message-content"><Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, {trust:false, throwOnError:false, maxExpand:1000}]]} skipHtml components={{img: ({alt}) => <span>{alt}</span>}}>{normalizeMath(text)}</Markdown></div>;
}
