package xyz.haoduoyu.personal;

import android.app.job.JobScheduler;
import android.content.Context;
import android.content.Intent;
import android.os.Looper;
import android.webkit.WebSettings;
import android.webkit.WebView;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import xyz.haoduoyu.personal.offline.LegacyRecoveryRuntime;
import xyz.haoduoyu.personal.offline.SqliteStateStore;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
@LooperMode(LooperMode.Mode.PAUSED)
public final class UnifiedShellTest {
    private ActivityController<MainActivity> controller;
    @Before public void isolate() throws Exception { resetRuntime(); }
    @After public void close() throws Exception {
        if (controller != null) controller.pause().stop().destroy();
        resetRuntime(); Shadows.shadowOf(Looper.getMainLooper()).idle();
    }
    private static Field field(Class<?> type, String name) throws Exception { Field value=type.getDeclaredField(name);value.setAccessible(true);return value; }
    private static void resetRuntime() throws Exception {
        Field singleton=field(LegacyRecoveryRuntime.class,"instance"); Object runtime=singleton.get(null);
        if(runtime!=null){
            android.os.Handler main=(android.os.Handler)field(LegacyRecoveryRuntime.class,"main").get(runtime);main.removeCallbacksAndMessages(null);
            ExecutorService worker=(ExecutorService)field(LegacyRecoveryRuntime.class,"worker").get(runtime);worker.shutdownNow();worker.awaitTermination(10,TimeUnit.SECONDS);
            SqliteStateStore source=(SqliteStateStore)field(LegacyRecoveryRuntime.class,"source").get(runtime);if(source!=null)source.close();
        }
        singleton.set(null,null);
    }
    @Test public void launcherUsesOneWebsiteAndPersistentWebStorageWithoutInitializingAnOldDatabase() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        Intent launcher=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull(launcher);assertEquals(MainActivity.class.getName(),launcher.getComponent().getClassName());
        controller=Robolectric.buildActivity(MainActivity.class).setup(); MainActivity activity=controller.get();
        WebView web=(WebView)field(MainActivity.class,"web").get(activity);
        assertEquals(UrlPolicy.HOME,Shadows.shadowOf(web).getLastLoadedUrl());
        assertTrue(web.getSettings().getJavaScriptEnabled());assertTrue(web.getSettings().getDomStorageEnabled());
        assertFalse(web.getSettings().getAllowFileAccess());assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW,web.getSettings().getMixedContentMode());
        assertFalse(context.getDatabasePath("haoduoyu-offline.db").exists());
        JobScheduler jobs=(JobScheduler)context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        assertNull(jobs.getPendingJob(27260));assertNull(jobs.getPendingJob(27261));
        assertEquals("3.0.0-debug",BuildConfig.VERSION_NAME);assertTrue(BuildConfig.VERSION_CODE>3);
    }
    @Test public void fixedNativeEventsAreNotEvaluatedWhenTheCurrentTopLevelDocumentIsForeign() throws Exception {
        controller=Robolectric.buildActivity(MainActivity.class).setup();MainActivity activity=controller.get();
        WebView web=(WebView)field(MainActivity.class,"web").get(activity);
        Method emit=MainActivity.class.getDeclaredMethod("emitNative",String.class);emit.setAccessible(true);
        web.loadUrl(UrlPolicy.HOME);emit.invoke(activity,NativeBridgeScripts.online());
        assertEquals(NativeBridgeScripts.online(),Shadows.shadowOf(web).getLastEvaluatedJavascript());
        web.loadUrl("https://foreign.invalid/");String previous=Shadows.shadowOf(web).getLastEvaluatedJavascript();
        emit.invoke(activity,NativeBridgeScripts.legacy(17,2,true));
        assertEquals(previous,Shadows.shadowOf(web).getLastEvaluatedJavascript());
    }
}
