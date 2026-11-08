using System.Diagnostics;
using System.IO;
using System.Text.Json;
using Haoduoyu.OriginalUi;
using Haoduoyu.OriginalUi.Policy;
using Microsoft.Web.WebView2.Core;

internal static class SharedPageScenario
{
    private sealed record Draft(string Family, string Route, string Selector, string Text, string RecordId, int Rows);
    internal static long LastInputAt { get; private set; }
    internal static async Task<bool> Prepare(OriginalUiWindow window, string phase, string root)
    {
        if(phase=="site")
        {
            await Editable(window,"#todo-text");
            var id="synthetic-cancel-"+Guid.NewGuid().ToString("N");
            await Script(window,"window.haoduoyuLocalLifecycle.requestFlush("+J(id)+")");
            await Wait(window,"window.haoduoyuLocalLifecycle.status("+J(id)+")==='complete'");
            if(await Script(window,"Boolean(document.querySelector('#todo-text').disabled || document.querySelector('#todo-text').readOnly)")!="true") throw new Exception("Complete did not retain editor lock.");
            await Script(window,"window.haoduoyuLocalLifecycle.resume("+J(id)+")");
            await Editable(window,"#todo-text");
            await Wait(window,"window.haoduoyuLocalLifecycle.status("+J(id)+")==='unknown'");
            Console.WriteLine("PASS actual shared lifecycle complete retains lock; same-token cancel/resume releases it");
            return false;
        }
        if(phase=="site-storage-failed")
        {
            await Editable(window,"#todo-text");
            await Script(window,"window.closeProbe={requested:null,resumed:null}; window.actualLifecycle=window.haoduoyuLocalLifecycle; window.haoduoyuLocalLifecycle={requestFlush(id){closeProbe.requested=id;return actualLifecycle.requestFlush(id)},status(id){return actualLifecycle.status(id)},resume(id){closeProbe.resumed=id;return actualLifecycle.resume(id)}}; window.syntheticOriginalPut=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(){throw new DOMException('SYNTHETIC quota failure','QuotaExceededError')}");
            try
            {
                await Focus(window,"#todo-text"); await Insert(window,"SYNTHETIC quota-failure unsaved draft 保留原文");
                await CloseSafety.Probe(window,"actual-storage-failed");
                await Editable(window,"#todo-text");
                if(await ReadString(window,"document.querySelector('#todo-text').value")!="SYNTHETIC quota-failure unsaved draft 保留原文") throw new Exception("Quota failure lost actual editor content.");
                Console.WriteLine("PASS actual shared IndexedDB write failure retained window and original draft, then released input lock");
            }
            finally { await Script(window,"IDBObjectStore.prototype.put=window.syntheticOriginalPut; window.haoduoyuLocalLifecycle=window.actualLifecycle"); }
            return false;
        }
        if (phase == "site-review")
        {
            await Navigate(window, "/?page=review&account=V%E5%AD%97");
            await Wait(window, "document.querySelector('#content-review .review-empty') && !document.querySelector('#content-review [role=alert]')");
            Console.WriteLine("PASS actual content-review original interface loaded with empty synthetic local database; no user/article fixtures injected");
            return false;
        }
        var pieces = phase.Split('-');
        if (pieces.Length != 3 || pieces[1] is not ("todo" or "future" or "note")) return false;
        var family=pieces[1]; var seed=pieces[2]=="seed";
        var statePath=Path.Combine(root,family+"-synthetic-scenario.json");
        Draft state;
        if (seed)
        {
            var route=family=="future" ? "/?page=todos&todo_panel=future" : family=="note" ? "/?page=notes" : "/?page=todos";
            await Navigate(window,route);
            var selector=family=="note" ? "#notes-active-entry [data-note-entry-editor]" : family=="future" ? "#todo-future-text" : "#todo-text";
            if (family=="note")
            {
                // The original new-entry button starts hidden (not disabled) until
                // its asynchronous page/store read completes. Do not click a hidden
                // control before the real user-facing create action is ready.
                await Wait(window,"(()=>{const b=document.querySelector('[data-notes-action=new]');return b && b.getClientRects().length && !b.disabled})()");
                await Script(window,"document.querySelector('[data-notes-action=new]').click()");
            }
            await Editable(window,selector);
            var id=family=="note" ? await ReadString(window,"document.querySelector("+J(selector)+").dataset.noteEntryEditor") : "";
            if (family=="todo") route += "&date="+await ReadString(window,"document.querySelector('#todo-form').dataset.date");
            var prefix="SYNTHETIC Windows "+family+" draft 初始内容";
            var suffix=" 最后几字保留验证";
            state=new Draft(family,route,selector,prefix+suffix,id,await RowCount(window,family));
            File.WriteAllText(statePath,JsonSerializer.Serialize(state));
            await Focus(window,selector);
            await Insert(window,prefix);
            // Capture actual product UI before the final input. Never add a screenshot,
            // wait-for-save or egress test between the final keystrokes and native Close.
            await Capture(window,Path.Combine(root,phase+"-1280.png"));
            window.Width=430; await Task.Delay(400); await Capture(window,Path.Combine(root,phase+"-430.png"));
            window.Width=1280;
            await Editable(window,selector); await Focus(window,selector);
            await Insert(window,suffix); // Chromium Input.insertText drives the real editor input path.
            LastInputAt=Stopwatch.GetTimestamp();
            return true;
        }
        state=JsonSerializer.Deserialize<Draft>(File.ReadAllText(statePath)) ?? throw new InvalidDataException("Synthetic scenario missing.");
        await Navigate(window,state.Route);
        if (family=="note")
        {
            var article="[data-note-entry="+J(state.RecordId)+"]";
            await Wait(window,"document.querySelector("+J(article)+")");
            if (await Script(window,"Boolean(document.querySelector("+J(state.Selector)+"))")!="true")
                await Script(window,"document.querySelector("+J(article)+").querySelector('[data-note-entry-action=edit]').click()");
        }
        await Editable(window,state.Selector);
        await Wait(window,"document.querySelector("+J(state.Selector)+").value==="+J(state.Text));
        if (await RowCount(window,family)!=state.Rows) throw new Exception("Draft restart changed expected record count.");
        Console.WriteLine("PASS actual "+family+" final input recovered after native close and independent process reopen; exact text and identity/count verified");
        // Also exercise reachable public UI create, note edit, and full-page offline reload.
        var form=family=="todo" ? "#todo-form" : family=="future" ? "#todo-future-form" : "";
        if (family=="note")
        {
            await Script(window,"document.querySelector("+J(state.Selector)+").closest('[data-note-entry]').querySelector('[data-note-entry-action=save]').click()");
            var article="[data-note-entry="+J(state.RecordId)+"]";
            await Wait(window,"document.querySelector("+J(article)+")?.querySelector('.note-entry-status')?.dataset.phase==='saved'");
            await Script(window,"document.querySelector("+J(article)+").querySelector('[data-note-entry-action=edit]').click()");
            await Editable(window,state.Selector);
            await Script(window,"document.querySelector("+J(state.Selector)+").focus();document.querySelector("+J(state.Selector)+").select()");
            state=state with {Text=state.Text+" 已通过真实编辑"};
            await Insert(window,state.Text);
            await Script(window,"document.querySelector("+J(state.Selector)+").closest('[data-note-entry]').querySelector('[data-note-entry-action=save]').click()");
            await Wait(window,"document.querySelector("+J(article)+")?.querySelector('.note-entry-status')?.dataset.phase==='saved'");
            await Navigate(window,state.Route);
            await Wait(window,"[...document.querySelectorAll("+J(article+" .note-entry-reader")+")].some(x=>x.textContent==="+J(state.Text)+")");
            if (await RowCount(window,family)!=state.Rows) throw new Exception("Note create/edit/reload duplicated records.");
        }
        else
        {
            await Script(window,"document.querySelector("+J(form)+").requestSubmit()");
            var rows=family=="todo" ? "#todo-items .daily-todo-text" : "#todo-future-items .daily-todo-text";
            await Wait(window,"[...document.querySelectorAll("+J(rows)+")].some(x=>x.textContent==="+J(state.Text)+")");
            await Navigate(window,state.Route);
            await Wait(window,"[...document.querySelectorAll("+J(rows)+")].some(x=>x.textContent==="+J(state.Text)+")");
            if (await RowCount(window,family)!=state.Rows+1) throw new Exception("Todo create/reload count differs.");
        }
        Console.WriteLine("PASS actual public "+family+" submit"+(family=="note"?"/edit":"")+" and offline page reload; synthetic records only");
        return false;
    }
    private static string J(string value)=>JsonSerializer.Serialize(value);
    private static Task<string> Script(OriginalUiWindow window,string js)=>window.Core.ExecuteScriptAsync(js).WaitAsync(TimeSpan.FromSeconds(5));
    private static async Task<string> ReadString(OriginalUiWindow window,string js)=>JsonSerializer.Deserialize<string>(await Script(window,js))??"";
    private static Task Editable(OriginalUiWindow window,string selector)=>Wait(window,"(()=>{const e=document.querySelector("+J(selector)+");return e && e.getClientRects().length && !e.disabled && !e.readOnly})()");
    private static Task<string> Focus(OriginalUiWindow window,string selector)=>Script(window,"document.querySelector("+J(selector)+").focus();document.querySelector("+J(selector)+").setSelectionRange(document.querySelector("+J(selector)+").value.length,document.querySelector("+J(selector)+").value.length)");
    private static Task<string> Insert(OriginalUiWindow window,string text)=>window.Core.CallDevToolsProtocolMethodAsync("Input.insertText",JsonSerializer.Serialize(new{text})).WaitAsync(TimeSpan.FromSeconds(5));
    private static async Task<int> RowCount(OriginalUiWindow window,string family)
    {
        var expr=family=="note" ? "new Set([...document.querySelectorAll('#daily-notes [data-note-entry]')].map(x=>x.dataset.noteEntry)).size" : family=="future" ? "document.querySelectorAll('#todo-future-items [data-future-todo-id]').length" : "document.querySelectorAll('#todo-items [data-todo-id]').length";
        return JsonSerializer.Deserialize<int>(await Script(window,expr));
    }
    private static async Task Navigate(OriginalUiWindow window,string route)
    {
        var ready=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void Completed(object? _,CoreWebView2NavigationCompletedEventArgs e) { if(e.IsSuccess) ready.TrySetResult(); else ready.TrySetException(new Exception("Actual local page navigation failed.")); }
        window.Core.NavigationCompleted+=Completed;
        try { window.Core.Navigate(RequestPolicy.Origin+route); await ready.Task.WaitAsync(TimeSpan.FromSeconds(20)); }
        finally { window.Core.NavigationCompleted-=Completed; }
    }
    private static async Task Wait(OriginalUiWindow window,string predicate)
    {
        for(var n=0;n<300;n++) { if(await Script(window,"Boolean("+predicate+")")=="true") return; await Task.Delay(50); }
        throw new TimeoutException("Actual shared-page assertion did not complete: "+predicate);
    }
    private static async Task Capture(OriginalUiWindow window,string path)
    { await Task.Delay(300); using var file=new FileStream(path,FileMode.CreateNew); await window.Core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,file); Program.ValidatePng(file); }
}
