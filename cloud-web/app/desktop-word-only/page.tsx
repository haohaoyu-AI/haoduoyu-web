'use client';

import {useEffect,useRef,useState} from 'react';
import {parseBridgeFragment,runDesktopWordBridge} from '../../lib/desktop-word-bridge';
import WordStageProgress,{mergeWordProgress,validateWordProgressDto} from '../../components/word-stage-progress';
import type {WordProgress} from '../../lib/word-progress-contract';

const localId=/^localword_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const progressScope=(value:WordProgress)=>JSON.stringify([value.target_id,value.input_sha256,value.attempt?.attempt_id,value.attempt?.generation,value.recovery?.epoch]);
const clientReadOrder=()=>typeof performance==='undefined'?Date.now():performance.now();
function localProgress(value:unknown):value is WordProgress{
 return validateWordProgressDto(value)&&value.target_kind==='local_word'&&localId.test(value.target_id);
}

export default function DesktopWordOnlyPage(){
  const [message,setMessage]=useState('请从本地版点击“求助小鱼”进入。');
  const [failed,setFailed]=useState(false);
  const [progress,setProgress]=useState<WordProgress|null>(null);
  const [progressUnavailable,setProgressUnavailable]=useState(false);
  const [disconnected,setDisconnected]=useState(false);
  const specRef=useRef<ReturnType<typeof parseBridgeFragment>|null>(null);
  const selected=useRef<WordProgress|null>(null),readEpoch=useRef(0),readController=useRef<AbortController|null>(null),bridgeController=useRef<AbortController|null>(null),mounted=useRef(true),privateHidden=useRef(false);
  const [reading,setReading]=useState(false),[readback,setReadback]=useState<WordProgress|null>(null),[readbackStartedAt,setReadbackStartedAt]=useState<number|undefined>(),[hasReadTarget,setHasReadTarget]=useState(false);
  function abortRead(){readEpoch.current++;readController.current?.abort();readController.current=null;}
  function hidePrivate(){
    privateHidden.current=true;readEpoch.current++;readController.current?.abort();readController.current=null;bridgeController.current?.abort();setReading(false);
    setProgress(null);setReadback(null);setReadbackStartedAt(undefined);setProgressUnavailable(false);setDisconnected(false);setFailed(true);
    setMessage('本站登录或访问状态已变化，旧 Word 详情已隐藏；请完成本人登录后重新读取本站进度。');
  }
  function showProgress(value:WordProgress){
    const previous=selected.current;
    const next=previous&&previous.target_id===value.target_id&&previous.input_sha256===value.input_sha256?mergeWordProgress(previous,value)!:value;
    if(!previous||progressScope(previous)!==progressScope(next)){readEpoch.current++;readController.current?.abort();readController.current=null;setReading(false);setReadback(null);setReadbackStartedAt(undefined);}
    selected.current=next;setProgress(next);setHasReadTarget(true);
  }
  async function readProgress(){
    const before=selected.current;if(!before||readController.current)return;
    const controller=new AbortController(),epoch=readEpoch.current,key=progressScope(before),startedAt=clientReadOrder();readController.current=controller;setReading(true);
    const live=()=>mounted.current&&!controller.signal.aborted&&epoch===readEpoch.current&&!!selected.current&&progressScope(selected.current)===key;
    try{
      const response=await fetch(`/api/local-word-jobs/${encodeURIComponent(before.target_id)}`,{method:'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      if(!live())return;
      if([401,403,404].includes(response.status)){hidePrivate();return;}
      if(!response.ok)throw Error();
      const body=await response.json() as {job?:{id?:string;input_sha256?:string;source_kind?:string;output_mode?:string;destinations?:unknown[];word_progress?:unknown;word_progress_unavailable?:boolean}};
      if(!live())return;const job=body.job;
      if(!job||job.id!==before.target_id||job.input_sha256!==before.input_sha256||job.source_kind!=='local_desktop'||job.output_mode!=='word_only'||!Array.isArray(job.destinations)||job.destinations.length)throw Error();
      const next=job.word_progress;
      if(!localProgress(next)||next.target_id!==before.target_id||next.input_sha256!==before.input_sha256||job.word_progress_unavailable===true)throw Error();
      const merged=mergeWordProgress(before,next)!;
      if((merged.attempt?.attempt_id||null)!==(next.attempt?.attempt_id||null)||(merged.attempt?.generation||0)!==(next.attempt?.generation||0)||(merged.recovery?.version||0)!==(next.recovery?.version||0)||(merged.recovery?.epoch||0)!==(next.recovery?.epoch||0))return;
      privateHidden.current=false;showProgress(next);setReadback(next);setReadbackStartedAt(startedAt);setProgressUnavailable(false);setDisconnected(false);setFailed(false);setMessage('已读取本站同一任务的进度；本机交付状态仍以本地版回执为准。');
    }catch{if(live()){setProgressUnavailable(true);setDisconnected(true);setFailed(true);setMessage('本站进度读取未确认；原任务保留，请重新读取同一任务。');}}
    finally{if(readController.current===controller)readController.current=null;if(mounted.current&&epoch===readEpoch.current)setReading(false);}
  }
  useEffect(()=>{
    const controller=new AbortController();bridgeController.current=controller;mounted.current=true;
    try{
      let spec=specRef.current;
      if(!spec){
        spec=parseBridgeFragment(window.location.hash);
        // Retain the first valid capability across effect replay, only in memory.
        specRef.current=spec;
        window.history.replaceState(null,'',window.location.pathname);
      }
      setFailed(false);
      void runDesktopWordBridge(spec,message=>{
        if(!controller.signal.aborted&&!privateHidden.current)setMessage(message);
      },controller.signal,fetch,(value,lost,unavailable=false)=>{if(!controller.signal.aborted&&!privateHidden.current){if(localProgress(value))showProgress(value);else if(!unavailable){selected.current=null;setHasReadTarget(false);readEpoch.current++;readController.current?.abort();readController.current=null;setProgress(null);setReadback(null);setReadbackStartedAt(undefined);setReading(false);}setProgressUnavailable(unavailable);setDisconnected(lost);}}).catch(()=>{
        if(!controller.signal.aborted)setFailed(true);
      });
    }catch(error){setMessage(error instanceof Error?error.message:'本机连接无效。');setFailed(true);}
    return ()=>{mounted.current=false;controller.abort();abortRead();};
  },[]);
  const visibleScope=progress?progressScope(progress):null;
  const authRequired=()=>{if(visibleScope&&selected.current&&progressScope(selected.current)===visibleScope)hidePrivate();};
  return <main className="min-h-screen bg-[#f5f7f3] p-6 text-[#17362a]">
    <section className="mx-auto mt-12 max-w-2xl rounded-2xl border border-[#d8e1d8] bg-white p-8 shadow-sm">
      <p className="mb-4 text-sm text-[#637368]">好多鱼 · 本地求助小鱼</p>
      <h1 className="text-3xl font-semibold">连接小鱼，自动配图排版</h1>
      <p className="mt-5 leading-7">使用本人正常登录处理本批文章。Word 成品会交回本地版，核验后保存到已排版文章目录，本批处理到此结束。</p>
      <p role="status" aria-live="polite" className={'mt-8 rounded-xl p-5 leading-7 '+(failed?'bg-red-50 text-red-800':'bg-[#eef4ee]')}>{message}</p>
      <WordStageProgress progress={progress} unavailable={progressUnavailable} readError={disconnected} reading={reading} onReadProgress={()=>void readProgress()} onAuthRequired={authRequired} readback={readback} readbackStartedAt={readbackStartedAt}/>
      {hasReadTarget&&<button type="button" disabled={reading} onClick={()=>void readProgress()}>重新读取本站进度</button>}
      <p className="mt-5 text-sm leading-6 text-[#637368]">处理过程中请保持此连接窗口打开。如浏览器要求本地网络权限，请通过正常权限提示授权本次连接。</p>
    </section>
  </main>;
}
