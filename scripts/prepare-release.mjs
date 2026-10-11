// Fallback source/packaging workflow for when the external Sites helper is unavailable.
// The short-lived repository credential is accepted on stdin only and never persisted.
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,mkdirSync,cpSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
if (!existsSync('dist/server/index.js')) throw new Error('Build the application first');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write('Ready for release JSON on stdin (input is hidden).\n');
let buffer='';
const input=await new Promise(resolve=>{process.stdin.setEncoding('utf8');process.stdin.resume();process.stdin.on('data',chunk=>{buffer+=chunk;const end=buffer.search(/[\r\n]/);if(end>=0){process.stdin.pause();resolve(buffer.slice(0,end));}})});
const credential=JSON.parse(input);
if (credential.auth_mode!=='http_extra_header') throw new Error('Unsupported authentication mode');
if (new URL(credential.remote_url).protocol!=='https:' || new URL(credential.remote_url).username) throw new Error('Expected a credential-free HTTPS repository URL');
if (credential.repository!==manifest.project_id) throw new Error('Repository does not match the Site');
const authEnv={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'http.extraHeader',GIT_CONFIG_VALUE_0:`Authorization: Bearer ${credential.token}`,GIT_CONFIG_KEY_1:'credential.helper',GIT_CONFIG_VALUE_1:''};
function run(command,args,env=process.env){const r=spawnSync(command,args,{cwd:root,env,encoding:'utf8',windowsHide:true});if(r.status!==0){const detail=(r.stderr||r.error?.message||'Command failed').replaceAll(credential.token,'[redacted]');throw new Error(`${command} failed: ${detail}`)}return r.stdout.trim()}
if (!existsSync('.git')) run('git',['init','-b',credential.branch]);
const remoteHead=run('git',['ls-remote',credential.remote_url,`refs/heads/${credential.branch}`],authEnv);
if(remoteHead) throw new Error('Remote already has source. Reconcile its history before publishing; never force push.');
run('git',['add','.']);
const staged=run('git',['diff','--cached','--name-only']);
if(staged.split('\n').some(p=>/^(?:\.env(?!\.example$)|\.dev\.vars(?!\.example$)|\.wrangler\/|node_modules\/)/.test(p))) throw new Error('Unexpected sensitive/runtime file in staged source');
if(staged) run('git',['-c','user.name=Convoke build','-c','user.email=convoke@local.invalid','commit','-m','Build Convoke persistent workspace alpha']);
const sha=run('git',['rev-parse','HEAD']);
run('git',['push',credential.remote_url,`HEAD:refs/heads/${credential.branch}`],authEnv);
const publishedHead=run('git',['ls-remote',credential.remote_url,`refs/heads/${credential.branch}`],authEnv).split(/\s/)[0];
if(publishedHead!==sha) throw new Error('Remote source verification failed');
const stage=path.join(root,'outputs','release');mkdirSync(stage,{recursive:true});
cpSync(path.join(root,'dist','.openai'),path.join(stage,'.openai'),{recursive:true});
cpSync(path.join(root,'dist','server'),path.join(stage,'dist','server'),{recursive:true});
cpSync(path.join(root,'dist','client'),path.join(stage,'dist','client'),{recursive:true});
const archive=path.join(root,'outputs','convoke-release.tar.gz');
run('tar',['-czf',archive,'-C',stage,'.openai','dist']);
process.stdout.write(JSON.stringify({project_id:manifest.project_id,commit_sha:sha,archive})+'\n');
if(process.stdin.isTTY) process.stdin.setRawMode(false);
