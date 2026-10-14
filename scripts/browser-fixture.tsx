import React from 'react';
import {createRoot} from 'react-dom/client';
import {testArtifact,documentForArtifact} from '../lib/runtime-client';
import {Answer} from '../components/answer';
import "katex/dist/katex.min.css";
import {VisualAnswers} from '../components/visual-answer';
import Workspace from '../app/workspace';
Object.assign(window,{testArtifact,documentForArtifact});
const root=createRoot(document.getElementById('root')!);
if(location.search.includes('workspace'))root.render(<Workspace signedIn displayName="Test"/>);
else root.render(<><Answer text={String.raw`Inline \(x^2 + y^2 = z^2\).

\[\frac{1}{2} + \sqrt{4}\]

\begin{align}a&=b+c\\d&=e\end{align}


`+'```latex\n\\int_0^1 x^2 dx=\\frac{1}{3}\n```\n\n'+String.raw`$$\begin{pmatrix}1&2\\3&4\end{pmatrix}$$`}/><VisualAnswers visuals={[
 {type:'mermaid',caption:'A request passes through checks before its result is shown.',source:'flowchart LR\n A[Request] --> B[Checks] --> C[Result]'},
 {type:'chart',caption:'A has value 2 and B has value negative 1.',kind:'bar',xLabel:'Group',yLabel:'Value',data:[{label:'A',value:2},{label:'B',value:-1}]},
 {type:'svg',caption:'A blue circle.',source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" fill="blue"/><script>parent.document.body.dataset.unsafe="yes"</script></svg>'}
]}/></>);
