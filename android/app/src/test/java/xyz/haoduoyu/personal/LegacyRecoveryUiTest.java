package xyz.haoduoyu.personal;

import android.app.AlertDialog;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.TextView;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.annotation.SQLiteMode;
import org.robolectric.shadows.ShadowAlertDialog;
import java.lang.reflect.Field;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import xyz.haoduoyu.personal.offline.LegacyRecoveryRuntime;
import xyz.haoduoyu.personal.offline.LocalRepository;
import xyz.haoduoyu.personal.offline.SqliteStateStore;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
@LooperMode(LooperMode.Mode.PAUSED)
@SQLiteMode(SQLiteMode.Mode.NATIVE)
public final class LegacyRecoveryUiTest {
    private ActivityController<LegacyRecoveryActivity> controller;
    private SqliteStateStore store;
    private static Field field(Class<?> type,String name)throws Exception{Field value=type.getDeclaredField(name);value.setAccessible(true);return value;}
    private void settle() throws Exception {
        LegacyRecoveryRuntime runtime=LegacyRecoveryRuntime.get(RuntimeEnvironment.getApplication());
        ((ExecutorService)field(LegacyRecoveryRuntime.class,"worker").get(runtime)).submit(()->{}).get(10,TimeUnit.SECONDS);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
    }
    @After public void close()throws Exception{
        if(controller!=null)controller.pause().stop().destroy();
        Field singleton=field(LegacyRecoveryRuntime.class,"instance");Object runtime=singleton.get(null);
        if(runtime!=null){
            ((android.os.Handler)field(LegacyRecoveryRuntime.class,"main").get(runtime)).removeCallbacksAndMessages(null);
            ExecutorService worker=(ExecutorService)field(LegacyRecoveryRuntime.class,"worker").get(runtime);worker.shutdownNow();worker.awaitTermination(10,TimeUnit.SECONDS);
            SqliteStateStore source=(SqliteStateStore)field(LegacyRecoveryRuntime.class,"source").get(runtime);if(source!=null)source.close();
        }
        singleton.set(null,null);if(store!=null)store.close();
    }
    private void seed(boolean large)throws Exception{
        store=new SqliteStateStore(RuntimeEnvironment.getApplication());LocalRepository repository=new LocalRepository(store);
        repository.create("note_entry","life","2026-10-26",new JSONObject().put("text","未同意公开上传的原文"));
        repository.setDraft("empty","");
        if(large){JSONObject state=store.read();StringBuilder text=new StringBuilder();for(int i=0;i<70000;i++)text.append('鱼');state.put("future_large",text.toString());store.write(state);}
    }
    @Test public void viewerRetainsPrivateStateAndIntentionallyEmptyDraftWithoutAnEditorOrUploadAction()throws Exception{
        seed(false);byte[] original=store.readRawPayload();
        controller=Robolectric.buildActivity(LegacyRecoveryActivity.class).setup();settle();
        View root=controller.get().findViewById(android.R.id.content);assertEquals(0,countEditors(root));
        View empty=find(root,"drafts · empty");assertNotNull(empty);empty.performClick();settle();
        AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();assertNotNull(dialog);
        assertEquals("复制这条",dialog.getButton(AlertDialog.BUTTON_POSITIVE).getText().toString());
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();settle();
        ClipboardManager clipboard=(ClipboardManager)controller.get().getSystemService(Context.CLIPBOARD_SERVICE);
        assertEquals("\"\"",clipboard.getPrimaryClip().getItemAt(0).getText().toString());
        assertArrayEquals(original,store.readRawPayload());assertNull(find(root,"允许公开同步"));
    }
    @Test public void aLargeReadOnlyRecordUsesSystemFileExportRatherThanClipboard()throws Exception{
        seed(true);byte[] original=store.readRawPayload();controller=Robolectric.buildActivity(LegacyRecoveryActivity.class).setup();settle();
        View raw=find(controller.get().findViewById(android.R.id.content),"完整原始状态（包括未知字段）");assertNotNull(raw);raw.performClick();settle();
        AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();assertEquals("导出这条",dialog.getButton(AlertDialog.BUTTON_POSITIVE).getText().toString());
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();settle();
        Intent picker=Shadows.shadowOf(controller.get()).getNextStartedActivityForResult().intent;
        assertEquals(Intent.ACTION_CREATE_DOCUMENT,picker.getAction());assertEquals("text/plain",picker.getType());
        assertArrayEquals(original,store.readRawPayload());
    }
    @Test public void staleExportAndNonProviderDestinationsAreRejectedBeforeWriting()throws Exception{
        seed(false);byte[] original=store.readRawPayload();
        controller=Robolectric.buildActivity(LegacyRecoveryActivity.class).setup();settle();
        LegacyRecoveryActivity activity=controller.get();
        activity.onActivityResult(11,android.app.Activity.RESULT_OK,new Intent().setData(Uri.parse("file:///unselected/old.db")));
        assertTrue(((TextView)field(LegacyRecoveryActivity.class,"status").get(activity)).getText().toString().contains("仅接受系统文件提供方"));
        activity.onActivityResult(11,android.app.Activity.RESULT_OK,new Intent().setData(Uri.parse("content://synthetic/stale-result")));
        assertTrue(((TextView)field(LegacyRecoveryActivity.class,"status").get(activity)).getText().toString().contains("导出选择已失效"));
        settle();assertArrayEquals(original,store.readRawPayload());
    }
    private static View find(View view,String text){
        if(view instanceof TextView&&text.contentEquals(((TextView)view).getText()))return view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){View match=find(((ViewGroup)view).getChildAt(i),text);if(match!=null)return match;}
        return null;
    }
    private static int countEditors(View view){int count=view instanceof EditText?1:0;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++)count+=countEditors(((ViewGroup)view).getChildAt(i));return count;}
}
