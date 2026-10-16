'use client';

import {useEffect,useRef,useState} from 'react';
import {parseBridgeFragment,runDesktopWordBridge} from '../../lib/desktop-word-bridge';
import WordStageProgress from '../../components/word-stage-progress';
import type {WordProgress} from '../../lib/word-progress-contract';

export default function DesktopWordOnlyPage(){
  const [message,setMessage]=useState('请从本地版点击“求助小鱼”进入。');
  const [failed,setFailed]=useState(false);
  const [progress,setProgress]=useState<WordProgress|null>(null);
  const [progressUnavailable,setProgressUnavailable]=useState(false);
  const [disconnected,setDisconnected]=useState(false);
  const specRef=useRef<ReturnType<typeof parseBridgeFragment>|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
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
        if(!controller.signal.aborted)setMessage(message);
      },controller.signal,fetch,(value,lost,unavailable=false)=>{if(!controller.signal.aborted){setProgress(previous=>value||(unavailable?previous:null));setProgressUnavailable(unavailable);setDisconnected(lost);}}).catch(()=>{
        if(!controller.signal.aborted)setFailed(true);
      });
    }catch(error){setMessage(error instanceof Error?error.message:'本机连接无效。');setFailed(true);}
    return ()=>controller.abort();
  },[]);
  return <main className="min-h-screen bg-[#f5f7f3] p-6 text-[#17362a]">
    <section className="mx-auto mt-12 max-w-2xl rounded-2xl border border-[#d8e1d8] bg-white p-8 shadow-sm">
      <p className="mb-4 text-sm text-[#637368]">好多鱼 · 本地求助小鱼</p>
      <h1 className="text-3xl font-semibold">连接小鱼，自动配图排版</h1>
      <p className="mt-5 leading-7">使用本人正常登录处理本批文章。Word 成品会交回本地版，核验后保存到已排版文章目录，本批处理到此结束。</p>
      <p role="status" aria-live="polite" className={'mt-8 rounded-xl p-5 leading-7 '+(failed?'bg-red-50 text-red-800':'bg-[#eef4ee]')}>{message}</p>
      <WordStageProgress progress={progress} unavailable={progressUnavailable} readError={disconnected}/>
      <p className="mt-5 text-sm leading-6 text-[#637368]">处理过程中请保持此连接窗口打开。如浏览器要求本地网络权限，请通过正常权限提示授权本次连接。</p>
    </section>
  </main>;
}
